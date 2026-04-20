'use client'

import { useState } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

interface GroupCardProps {
  id: string
  icon: React.ReactNode
  title: string
  description: string
  progress: number // 0-100
  completed: boolean
  color: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function GroupCard({
  icon, title, description, progress, completed, color, defaultOpen, children,
}: GroupCardProps) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: `${color}1a`, color }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
            {completed && <CheckCircle2 className="w-4 h-4" style={{ color: '#22c55e' }} />}
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </p>
          <div className="mt-2 h-1 rounded-full overflow-hidden"
               style={{ background: 'var(--surface-1)' }}>
            <div className="h-full rounded-full transition-all"
                 style={{ width: `${progress}%`, background: color }} />
          </div>
        </div>
        <ChevronDown className="w-5 h-5 shrink-0 transition-transform"
                     style={{
                       color: 'var(--text-tertiary)',
                       transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                     }} />
      </button>
      {open && (
        <div className="p-4 border-t" style={{ borderColor: 'var(--glass-border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function Field({
  label, hint, children, required,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold"
            style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{hint}</span>}
    </label>
  )
}

export const inputCls = "w-full px-3 py-2 rounded-lg text-sm"
export const inputStyle: React.CSSProperties = {
  background: 'var(--surface-1)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-primary)',
}

export function StatusPill({ status, text }: { status: 'ok' | 'warn' | 'error' | 'pending' | 'idle'; text: string }) {
  const colors = {
    ok: { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' },
    warn: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
    error: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' },
    pending: { bg: 'rgba(6,182,212,0.15)', fg: '#06b6d4' },
    idle: { bg: 'var(--surface-2)', fg: 'var(--text-tertiary)' },
  }[status]
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: colors.bg, color: colors.fg }}>
      {text}
    </span>
  )
}
