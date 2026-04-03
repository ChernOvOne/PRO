'use client'

import { useState } from 'react'
import {
  FileText, Download, Calendar, FileSpreadsheet,
  Clock, ChevronRight, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ── Helpers ───────────────────────────────────────────────── */

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function startOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function startOfQuarter() {
  const d = new Date()
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q, 1).toISOString().slice(0, 10)
}

function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
}

/* ── Quick-range presets ──────────────────────────────────── */

const PRESETS = [
  { label: 'Неделя',   icon: Clock,      from: () => shiftDate(-7),  to: todayISO },
  { label: 'Месяц',    icon: Calendar,   from: startOfMonth,         to: todayISO },
  { label: 'Квартал',  icon: Calendar,   from: startOfQuarter,       to: todayISO },
  { label: 'Год',      icon: Calendar,   from: startOfYear,          to: todayISO },
] as const

/* ── Component ────────────────────────────────────────────── */

export default function AdminReportsExportPage() {
  const [dateFrom, setDateFrom] = useState(startOfMonth())
  const [dateTo, setDateTo]     = useState(todayISO())
  const [format, setFormat]     = useState<'pdf' | 'excel'>('pdf')
  const [loading, setLoading]   = useState(false)

  /* ── Apply preset ────────────────────────────── */

  function applyPreset(p: typeof PRESETS[number]) {
    setDateFrom(p.from())
    setDateTo(p.to())
  }

  /* ── Download handler ────────────────────────── */

  async function handleDownload() {
    if (!dateFrom || !dateTo) {
      toast.error('Выберите даты')
      return
    }

    setLoading(true)
    try {
      const endpoint = format === 'pdf' ? '/api/admin/reports/pdf' : '/api/admin/reports/excel'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo }),
        credentials: 'include',
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `report_${dateFrom}_${dateTo}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success('Отчёт скачан')
    } catch {
      toast.error('Генерация отчётов будет доступна в следующем обновлении')
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ──────────────────────────────────── */

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Экспорт отчётов
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Формирование финансовых отчётов в PDF и Excel
        </p>
      </div>

      {/* Placeholder banner */}
      <div className="rounded-2xl p-5 flex items-start gap-4"
           style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)' }}>
        <FileText className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>
            Генерация отчётов будет доступна в следующем обновлении
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Интерфейс уже готов — функция заработает после подключения серверной части (Phase 7).
          </p>
        </div>
      </div>

      {/* Quick presets */}
      <div className="rounded-2xl p-5 space-y-4"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Быстрый экспорт
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRESETS.map(p => {
            const Icon = p.icon
            const active = dateFrom === p.from() && dateTo === p.to()
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="rounded-xl p-4 text-left transition-all hover:scale-[1.02]"
                style={{
                  background: active ? 'rgba(139,92,246,0.12)' : 'var(--glass-bg)',
                  border: `1px solid ${active ? 'rgba(139,92,246,0.3)' : 'var(--glass-border)'}`,
                }}
              >
                <Icon className="w-5 h-5 mb-2"
                      style={{ color: active ? '#a78bfa' : 'var(--text-tertiary)' }} />
                <p className="text-sm font-medium"
                   style={{ color: active ? '#a78bfa' : 'var(--text-primary)' }}>
                  {p.label}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {p.from()} — {p.to()}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom date range + format */}
      <div className="rounded-2xl p-5 space-y-5"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Настройки отчёта
        </h2>

        {/* Date pickers */}
        <div className="flex gap-3 flex-wrap items-center">
          <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Дата с</label>
            <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                   value={dateFrom}
                   onChange={e => setDateFrom(e.target.value)} />
          </div>
          <span className="text-xs mt-5" style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Дата по</label>
            <input type="date" className="glass-input py-1.5 px-3 text-sm w-auto"
                   value={dateTo}
                   onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* Format selector */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Формат
          </label>
          <div className="flex rounded-xl overflow-hidden w-fit"
               style={{ border: '1px solid var(--glass-border)' }}>
            <button
              onClick={() => setFormat('pdf')}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: format === 'pdf' ? 'rgba(239,68,68,0.12)' : 'transparent',
                color: format === 'pdf' ? '#f87171' : 'var(--text-secondary)',
              }}
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={() => setFormat('excel')}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: format === 'excel' ? 'rgba(52,211,153,0.12)' : 'transparent',
                color: format === 'excel' ? '#34d399' : 'var(--text-secondary)',
              }}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={loading || !dateFrom || !dateTo}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Формирование...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Скачать отчёт
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Info card */}
      <div className="rounded-2xl p-4 flex items-start gap-3"
           style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }} />
        <div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Отчёт включает все транзакции за выбранный период: доходы, расходы, прибыль,
            разбивку по категориям и ежемесячную динамику.
          </p>
        </div>
      </div>
    </div>
  )
}
