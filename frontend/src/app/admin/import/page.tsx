'use client'

import { useEffect, useState } from 'react'
import {
  Upload, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Download, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import { Card, Button, Badge, Skeleton } from '@/components/ui'

interface ImportStats {
  total:     number
  matched:   number
  pending:   number
  unmatched: number
}

export default function AdminImport() {
  const [stats,   setStats]   = useState<ImportStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = async () => {
    try {
      const d = await adminApi.importStatus()
      setStats(d)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const runImport = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/admin/import/run', {
        method: 'POST', credentials: 'include',
      })
      if (!res.ok) throw new Error('Ошибка запуска импорта')
      toast.success('Импорт запущен. Проверь логи сервиса.')
      setTimeout(() => load(), 3000)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRunning(false)
    }
  }

  const downloadTemplate = () => {
    const csv = 'email,telegram_id\nuser@example.com,123456789\n,987654321\nanother@mail.ru,\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = 'import-template.csv'
    a.click()
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    </div>
  )

  const matchPct = stats && stats.total > 0
    ? Math.round((stats.matched / stats.total) * 100)
    : 0

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Импорт пользователей</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Загрузка существующей базы email / Telegram ID
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users,        label: 'Записей',   value: stats.total,     color: 'blue' },
            { icon: CheckCircle2, label: 'Сопоставлено', value: stats.matched, color: 'emerald' },
            { icon: Clock,        label: 'Ожидают',   value: stats.pending,   color: 'yellow' },
            { icon: AlertCircle,  label: 'Не найдено', value: stats.unmatched, color: 'red' },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="text-center p-5">
              <div className={`w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center
                              ${color === 'blue'    ? 'bg-blue-500/15 text-blue-400' :
                                color === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' :
                                color === 'yellow'  ? 'bg-yellow-500/15 text-yellow-400' :
                                                     'bg-red-500/15 text-red-400'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Progress */}
      {stats && stats.total > 0 && (
        <Card className="space-y-3">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Прогресс сопоставления</span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{matchPct}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${matchPct}%`, background: 'linear-gradient(90deg, rgba(6,182,212,0.8), #10b981)' }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {stats.matched} из {stats.total} записей успешно привязаны к REMNAWAVE
          </p>
        </Card>
      )}

      {/* How it works */}
      <Card className="space-y-5">
        <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Как работает импорт</h2>
        <ol className="space-y-4">
          {[
            {
              step: '1',
              title: 'Подготовь файл',
              desc: 'CSV или JSON с полями email и/или telegram_id. Можно указать только одно из двух.',
            },
            {
              step: '2',
              title: 'Загрузи на сервер',
              desc: 'Скопируй файл в ./data/import.csv или ./data/import.json на сервере.',
              code: 'scp import.csv user@server:/opt/hideyou/data/',
            },
            {
              step: '3',
              title: 'Запусти импорт',
              desc: 'Нажми кнопку ниже или выполни команду в терминале.',
              code: 'bash install.sh → пункт 10, или: make import',
            },
            {
              step: '4',
              title: 'Автоматическое сопоставление',
              desc: 'Система найдёт каждого пользователя в REMNAWAVE по email или Telegram ID и привяжет подписку.',
            },
          ].map(({ step, title, desc, code }) => (
            <li key={step} className="flex gap-4">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
                              flex-shrink-0 mt-0.5"
                   style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--accent-1)' }}>
                {step}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{title}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
                {code && (
                  <code className="block mt-2 text-xs px-3 py-2 rounded-lg font-mono"
                        style={{ background: 'var(--surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)', color: 'var(--accent-1)' }}>
                    {code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={downloadTemplate} variant="secondary">
          <Download className="w-4 h-4" />
          Скачать шаблон CSV
        </Button>
        <Button onClick={load} variant="secondary">
          <RefreshCw className="w-4 h-4" />
          Обновить статистику
        </Button>
        <Button onClick={runImport} loading={running}>
          <Upload className="w-4 h-4" />
          Запустить импорт
        </Button>
      </div>

      {/* File format reference */}
      <Card className="space-y-3">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Формат файла</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs mb-2 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>CSV</p>
            <pre className="text-xs p-3 rounded-xl font-mono overflow-auto"
                 style={{ background: 'var(--surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)', color: 'var(--accent-1)' }}>
{`email,telegram_id
user@example.com,123456789
another@mail.ru,
,987654321`}
            </pre>
          </div>
          <div>
            <p className="text-xs mb-2 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>JSON</p>
            <pre className="text-xs p-3 rounded-xl font-mono overflow-auto"
                 style={{ background: 'var(--surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)', color: 'var(--accent-1)' }}>
{`[
  {"email":"u@mail.com",
   "telegram_id":"12345"},
  {"telegram_id":"67890"}
]`}
            </pre>
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Поля необязательны — достаточно одного из двух. Система последовательно
          ищет совпадение в REMNAWAVE: сначала по email, затем по Telegram ID.
        </p>
      </Card>
    </div>
  )
}
