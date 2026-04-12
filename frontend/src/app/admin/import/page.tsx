'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Upload, Download, Users, CreditCard, Check, X, AlertCircle, Loader2,
  FileSpreadsheet, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────
type Tab = 'users' | 'payments' | 'accounting'

interface UploadResult {
  fileId: string
  type: 'xlsx' | 'csv'
  headers: string[]
  preview: any[][]
  totalRows: number
}

interface ImportJob {
  id: string
  type: 'users' | 'payments' | 'accounting'
  status: 'pending' | 'running' | 'done' | 'error'
  total: number
  processed: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorMessages: string[]
}

// ── Field options for mapping dropdowns ──────────────────────
const USER_FIELDS: { value: string; label: string; required?: boolean }[] = [
  { value: '-', label: '— игнорировать —' },
  { value: 'telegramId', label: 'Telegram ID (обязательно)', required: true },
  { value: 'leadtehId', label: 'Leadteh ID' },
  { value: 'telegramName', label: 'Telegram Username' },
  { value: 'email', label: 'Email' },
  { value: 'remnawaveUuid', label: 'UUID REMNAWAVE' },
  { value: 'referrerLeadtehId', label: 'Реферер Leadteh ID' },
  { value: 'referrerTgId', label: 'Реферер TG ID' },
  { value: 'balance', label: 'Баланс' },
]

const PAYMENT_FIELDS: { value: string; label: string; required?: boolean }[] = [
  { value: '-', label: '— игнорировать —' },
  { value: 'externalPaymentId', label: 'ID платежа (обязательно)', required: true },
  { value: 'createdAt', label: 'Дата' },
  { value: 'grossAmount', label: 'Сумма платежа' },
  { value: 'amount', label: 'Сумма к зачислению (обязательно)', required: true },
  { value: 'description', label: 'Описание (обязательно)', required: true },
  { value: 'status', label: 'Статус' },
  { value: 'refundAmount', label: 'Сумма возврата' },
  { value: 'refundDate', label: 'Дата возврата' },
]

// ── Auto-detect header mapping ───────────────────────────────
function autoMap(header: string, type: Tab): string {
  const h = header.toLowerCase()
  if (type === 'users') {
    if (h.includes('telegram id') || h === 'telegram_id') return 'telegramId'
    if (h.includes('leadteh')) return h.includes('реферер') ? 'referrerLeadtehId' : 'leadtehId'
    if (h.includes('username')) return 'telegramName'
    if (h.includes('email')) return 'email'
    if (h.includes('uuid')) return 'remnawaveUuid'
    if (h.includes('баланс')) return 'balance'
    if (h.includes('реферер') && h.includes('tg')) return 'referrerTgId'
  } else if (type === 'payments') {
    if (h.includes('идентификатор') || h.includes('id платежа') || h === 'id' || h === 'payment_id') return 'externalPaymentId'
    if (h === 'дата платежа' || h.includes('дата создания') || h === 'created_at' || h === 'date') return 'createdAt'
    if (h === 'сумма платежа' || h.includes('полная сумма') || h.includes('gross')) return 'grossAmount'
    if (h.includes('сумма к зачислению') || h.includes('к зачислению') || h.includes('получено') || h === 'amount' || h === 'income_amount') return 'amount'
    if (h.includes('описание') || h.includes('назначение') || h === 'description') return 'description'
    if (h === 'статус платежа' || h === 'статус' || h === 'status') return 'status'
    if (h.includes('сумма возврата') || h === 'refund_amount') return 'refundAmount'
    if (h.includes('дата возврата') || h === 'refund_date') return 'refundDate'
  }
  return '-'
}

// ── Component ────────────────────────────────────────────────
export default function AdminUniversalImport() {
  const [tab, setTab] = useState<Tab>('users')
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<ImportJob | null>(null)
  const [stats, setStats] = useState<{ usersWithLeadtehId: number; paymentsWithCommission: number; totalCommission: number } | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Accounting-specific state
  const [accFileId, setAccFileId] = useState<string | null>(null)
  const [accPreview, setAccPreview] = useState<any>(null)
  const [accUploading, setAccUploading] = useState(false)
  const [accOptions, setAccOptions] = useState({
    expenses: true, investments: true, inkas: true, ads: true, servers: true, stats: true,
  })
  const [accStarting, setAccStarting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearingUsers, setClearingUsers] = useState(false)
  const [clearingPayments, setClearingPayments] = useState(false)
  const accFileRef = useRef<HTMLInputElement>(null)

  const loadStats = async () => {
    try {
      const s = await adminApi.importStats()
      setStats(s)
    } catch {}
  }

  useEffect(() => {
    loadStats()
    return () => {
      if (esRef.current) esRef.current.close()
    }
  }, [])

  // Reset state on tab switch
  const switchTab = (t: Tab) => {
    if (esRef.current) esRef.current.close()
    setTab(t)
    setUpload(null)
    setMapping({})
    setJob(null)
    setAccFileId(null)
    setAccPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (accFileRef.current) accFileRef.current.value = ''
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUpload(null)
    setMapping({})
    setJob(null)
    try {
      const res: UploadResult = await adminApi.uploadImport(file)
      setUpload(res)
      // Auto-map
      const m: Record<string, string> = {}
      for (const h of res.headers) m[h] = autoMap(h, tab)
      setMapping(m)
      toast.success(`Загружено: ${res.totalRows} строк`)
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  const handleMappingChange = (header: string, value: string) => {
    setMapping((prev) => ({ ...prev, [header]: value }))
  }

  const startImport = async () => {
    if (!upload) return

    // Validate required
    const required = tab === 'users'
      ? ['telegramId']
      : ['externalPaymentId', 'amount', 'description']
    const used = new Set(Object.values(mapping))
    const missing = required.filter((r) => !used.has(r))
    if (missing.length) {
      toast.error(`Не заполнены обязательные поля: ${missing.join(', ')}`)
      return
    }

    setStarting(true)
    setJob(null)
    try {
      const { jobId } = tab === 'users'
        ? await adminApi.startUserImport(upload.fileId, mapping)
        : await adminApi.startPaymentImport(upload.fileId, mapping)

      // Open SSE
      if (esRef.current) esRef.current.close()
      const es = new EventSource(`/api/admin/import/jobs/${jobId}`, { withCredentials: true } as any)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const j: ImportJob = JSON.parse(e.data)
          setJob(j)
          if (j.status === 'done' || j.status === 'error') {
            es.close()
            esRef.current = null
            if (j.status === 'done') {
              toast.success(`Готово: создано ${j.created}, обновлено ${j.updated}`)
              loadStats()
            } else {
              toast.error('Импорт завершён с ошибкой')
            }
          }
        } catch {}
      }
      es.onerror = () => {
        es.close()
        esRef.current = null
      }
    } catch (err: any) {
      toast.error(err?.message || 'Не удалось запустить импорт')
    } finally {
      setStarting(false)
    }
  }

  const fieldOptions = tab === 'users' ? USER_FIELDS : PAYMENT_FIELDS
  const templateHref = tab === 'users' ? '/templates/template-users.csv' : '/templates/template-payments.csv'

  const pct = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Универсальный импорт</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Загрузка пользователей и платежей из XLSX / CSV с маппингом колонок
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Пользователей с Leadteh ID</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{stats.usersWithLeadtehId}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Платежей с комиссией</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{stats.paymentsWithCommission}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Сумма комиссии, ₽</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              {stats.totalCommission.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <button
          onClick={() => switchTab('users')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all`}
          style={{
            background: tab === 'users' ? 'var(--accent-1)' : 'transparent',
            color: tab === 'users' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <Users className="w-4 h-4" />
          Пользователи
        </button>
        <button
          onClick={() => switchTab('payments')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all`}
          style={{
            background: tab === 'payments' ? 'var(--accent-1)' : 'transparent',
            color: tab === 'payments' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <CreditCard className="w-4 h-4" />
          Платежи
        </button>
        <button
          onClick={() => switchTab('accounting')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all`}
          style={{
            background: tab === 'accounting' ? 'var(--accent-1)' : 'transparent',
            color: tab === 'accounting' ? '#fff' : 'var(--text-secondary)',
          }}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Учёт (xlsx)
        </button>
      </div>

      {/* Accounting tab */}
      {tab === 'accounting' && (
        <div className="space-y-4">
          {/* Clear data */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Очистка данных бухгалтерии</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Удалит все транзакции, инкасации, рекламные кампании, серверы, статистику и партнёров
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('Удалить ВСЕ данные бухгалтерии? Это действие необратимо!')) return
                  setClearing(true)
                  try {
                    await adminApi.clearBuhData()
                    toast.success('Данные бухгалтерии очищены')
                  } catch (err: any) {
                    toast.error(err?.message || 'Ошибка очистки')
                  } finally {
                    setClearing(false)
                  }
                }}
                disabled={clearing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Очистить базу
              </button>
            </div>
          </div>

          {/* Upload accounting xlsx */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              1. Загрузка файла учёта
            </h2>
            <label className="block">
              <div
                className="flex items-center gap-3 px-4 py-4 rounded-xl cursor-pointer transition-all"
                style={{ background: 'var(--surface-2)', border: '1px dashed var(--glass-border)' }}
              >
                {accUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-1)' }} />
                ) : (
                  <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {accUploading ? 'Анализ файла...' : accPreview ? 'Файл проанализирован' : 'Выберите файл Учёт.xlsx'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    Расходы, инвестиции, инкасации, реклама, серверы, статистика
                  </p>
                </div>
              </div>
              <input
                ref={accFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setAccUploading(true)
                  setAccPreview(null)
                  setAccFileId(null)
                  setJob(null)
                  try {
                    const res = await adminApi.accountingPreview(file)
                    setAccFileId(res.fileId)
                    setAccPreview(res.preview)
                    toast.success('Файл проанализирован')
                  } catch (err: any) {
                    toast.error(err?.message || 'Ошибка анализа файла')
                  } finally {
                    setAccUploading(false)
                  }
                }}
                disabled={accUploading}
              />
            </label>
          </div>

          {/* Preview */}
          {accPreview && (
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                2. Что будет импортировано
              </h2>
              <div className="space-y-2">
                {[
                  { key: 'expenses', label: 'Расходы со счёта', count: accPreview.expenses?.count, amount: accPreview.expenses?.totalAmount },
                  { key: 'investments', label: 'Инвестиции (расходы)', count: accPreview.investments?.count, amount: accPreview.investments?.totalAmount },
                  { key: 'inkas', label: 'Инкасации', count: accPreview.inkas?.count, amount: accPreview.inkas?.totalAmount },
                  { key: 'ads', label: 'Рекламные кампании', count: accPreview.ads?.count, amount: accPreview.ads?.totalAmount },
                  { key: 'servers', label: 'Серверы (рег. платежи)', count: accPreview.servers?.count },
                  { key: 'stats', label: 'Месячная статистика', count: accPreview.stats?.count },
                ].map(({ key, label, count, amount }) => (
                  <label key={key} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                    <input
                      type="checkbox"
                      checked={accOptions[key as keyof typeof accOptions]}
                      onChange={(e) => setAccOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="w-4 h-4 rounded"
                    />
                    <div className="flex-1">
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>
                        {count || 0} записей
                        {amount ? ` — ${Number(amount).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽` : ''}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                <div className="flex items-start gap-2" style={{ color: '#eab308' }}>
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <b>Инвестиции</b> — видны в расходах, но НЕ вычитаются из баланса (оплачено инвесторами).
                    При повторном импорте записи обновляются, дубликаты не создаются.
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!accFileId) return
                  setAccStarting(true)
                  setJob(null)
                  try {
                    const { jobId } = await adminApi.startAccountingImport(accFileId, accOptions)
                    if (esRef.current) esRef.current.close()
                    const es = new EventSource(`/api/admin/import/jobs/${jobId}`, { withCredentials: true } as any)
                    esRef.current = es
                    es.onmessage = (e) => {
                      try {
                        const j: ImportJob = JSON.parse(e.data)
                        setJob(j)
                        if (j.status === 'done' || j.status === 'error') {
                          es.close()
                          esRef.current = null
                          if (j.status === 'done') {
                            toast.success(`Готово: создано ${j.created}, пропущено ${j.skipped}`)
                            loadStats()
                          } else {
                            toast.error('Импорт завершён с ошибкой')
                          }
                        }
                      } catch {}
                    }
                    es.onerror = () => { es.close(); esRef.current = null }
                  } catch (err: any) {
                    toast.error(err?.message || 'Не удалось запустить импорт')
                  } finally {
                    setAccStarting(false)
                  }
                }}
                disabled={accStarting || (job?.status === 'running')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: 'var(--accent-1)', color: '#fff' }}
              >
                {accStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Запустить импорт
              </button>
            </div>
          )}
        </div>
      )}

      {/* Clear data buttons for users/payments */}
      {tab === 'users' && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Очистка пользователей</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Удалит всех пользователей кроме администраторов, включая связанные данные
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm('Удалить ВСЕХ пользователей кроме админов? Это действие необратимо!')) return
                setClearingUsers(true)
                try {
                  const res = await adminApi.clearUsers()
                  toast.success(`Удалено ${res.deleted} пользователей`)
                  loadStats()
                } catch (err: any) {
                  toast.error(err?.message || 'Ошибка очистки')
                } finally {
                  setClearingUsers(false)
                }
              }}
              disabled={clearingUsers}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {clearingUsers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Очистить пользователей
            </button>
          </div>
        </div>
      )}
      {tab === 'payments' && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Очистка платежей</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Удалит все платежи и обнулит счётчики оплат у пользователей
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm('Удалить ВСЕ платежи? Счётчики оплат у пользователей будут обнулены. Это действие необратимо!')) return
                setClearingPayments(true)
                try {
                  const res = await adminApi.clearPayments()
                  toast.success(`Удалено ${res.deleted} платежей`)
                  loadStats()
                } catch (err: any) {
                  toast.error(err?.message || 'Ошибка очистки')
                } finally {
                  setClearingPayments(false)
                }
              }}
              disabled={clearingPayments}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {clearingPayments ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Очистить платежи
            </button>
          </div>
        </div>
      )}

      {/* Upload card (users/payments) */}
      {tab !== 'accounting' && (<div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            1. Загрузка файла
          </h2>
          <a
            href={templateHref}
            download
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}
          >
            <Download className="w-4 h-4" />
            Скачать шаблон
          </a>
        </div>

        <label className="block">
          <div
            className="flex items-center gap-3 px-4 py-4 rounded-xl cursor-pointer transition-all"
            style={{ background: 'var(--surface-2)', border: '1px dashed var(--glass-border)' }}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-1)' }} />
            ) : (
              <Upload className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {uploading ? 'Загрузка...' : upload ? `Файл загружен: ${upload.totalRows} строк` : 'Выберите файл XLSX или CSV'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Поддерживаются .xlsx, .csv (разделитель `;` или `,`)
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>)}

      {/* Preview & Mapping */}
      {tab !== 'accounting' && upload && (
        <>
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              2. Превью ({Math.min(10, upload.preview.length)} из {upload.totalRows})
            </h2>
            <div className="overflow-auto rounded-xl" style={{ border: '1px solid var(--glass-border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {upload.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upload.preview.slice(0, 10).map((row, ri) => (
                    <tr key={ri} style={{ borderTop: '1px solid var(--glass-border)' }}>
                      {upload.headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {String(row[ci] ?? '').slice(0, 60)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              3. Маппинг колонок
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upload.headers.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-secondary)' }} title={header}>
                    {header}
                  </div>
                  <select
                    className="glass-input rounded-xl px-3 py-2 text-sm flex-1"
                    value={mapping[header] || '-'}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                  >
                    {fieldOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                onClick={startImport}
                disabled={starting || (job?.status === 'running')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: 'var(--accent-1)', color: '#fff' }}
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Запустить импорт
              </button>
            </div>
          </div>
        </>
      )}

      {/* Progress */}
      {job && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Прогресс
            </h2>
            <span className="text-sm flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
              {job.status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
              {job.status === 'done' && <Check className="w-4 h-4" style={{ color: '#34d399' }} />}
              {job.status === 'error' && <X className="w-4 h-4" style={{ color: '#f87171' }} />}
              {job.status === 'running' ? 'Идёт импорт...' : job.status === 'done' ? 'Готово' : job.status === 'error' ? 'Ошибка' : 'Ожидание'}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>{job.processed} / {job.total}</span>
              <span style={{ color: 'var(--text-primary)' }}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: 'var(--accent-1)' }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pt-2">
              <div style={{ color: 'var(--text-tertiary)' }}>
                Создано: <b style={{ color: '#34d399' }}>{job.created}</b>
              </div>
              <div style={{ color: 'var(--text-tertiary)' }}>
                Обновлено: <b style={{ color: '#60a5fa' }}>{job.updated}</b>
              </div>
              <div style={{ color: 'var(--text-tertiary)' }}>
                Пропущено: <b style={{ color: '#fbbf24' }}>{job.skipped}</b>
              </div>
              <div style={{ color: 'var(--text-tertiary)' }}>
                Ошибок: <b style={{ color: '#f87171' }}>{job.errors}</b>
              </div>
            </div>
          </div>

          {job.errorMessages && job.errorMessages.length > 0 && (
            <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: '#f87171' }}>
                <AlertCircle className="w-4 h-4" />
                <b>Первые ошибки:</b>
              </div>
              <div className="space-y-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                {job.errorMessages.slice(0, 10).map((m, i) => (
                  <div key={i} className="truncate">{m}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
