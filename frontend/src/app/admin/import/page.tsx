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
        <h1 className="text-2xl font-bold">Импорт пользователей</h1>
        <p className="text-gray-400 text-sm mt-0.5">
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
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Progress */}
      {stats && stats.total > 0 && (
        <Card className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Прогресс сопоставления</span>
            <span className="font-medium">{matchPct}%</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-600 to-emerald-500 rounded-full transition-all"
              style={{ width: `${matchPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {stats.matched} из {stats.total} записей успешно привязаны к REMNAWAVE
          </p>
        </Card>
      )}

      {/* How it works */}
      <Card className="space-y-5">
        <h2 className="font-semibold text-lg">Как работает импорт</h2>
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
              <div className="w-7 h-7 rounded-full bg-brand-600/20 border border-brand-500/30
                              flex items-center justify-center text-brand-400 text-sm font-bold
                              flex-shrink-0 mt-0.5">
                {step}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{title}</p>
                <p className="text-gray-500 text-sm mt-0.5">{desc}</p>
                {code && (
                  <code className="block mt-2 text-xs bg-gray-800 border border-gray-700
                                   px-3 py-2 rounded-lg text-brand-300 font-mono">
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
        <h2 className="font-semibold">Формат файла</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">CSV</p>
            <pre className="text-xs bg-gray-800 border border-gray-700 p-3 rounded-xl
                            text-brand-300 font-mono overflow-auto">
{`email,telegram_id
user@example.com,123456789
another@mail.ru,
,987654321`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">JSON</p>
            <pre className="text-xs bg-gray-800 border border-gray-700 p-3 rounded-xl
                            text-brand-300 font-mono overflow-auto">
{`[
  {"email":"u@mail.com",
   "telegram_id":"12345"},
  {"telegram_id":"67890"}
]`}
            </pre>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Поля необязательны — достаточно одного из двух. Система последовательно
          ищет совпадение в REMNAWAVE: сначала по email, затем по Telegram ID.
        </p>
      </Card>
    </div>
  )
}
