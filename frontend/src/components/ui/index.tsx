'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode, useState } from 'react'
import { Loader2, X, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'

// ── Button ────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?:    'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
    const variants = {
      primary:   'btn-primary',
      secondary: 'btn-secondary',
      ghost:     'btn-ghost',
      danger:    'text-red-400 border border-red-500/20 hover:bg-red-500/10',
    }
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-7 py-3.5 text-base',
    }
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(base, variant !== 'primary' && variant !== 'secondary' && variant !== 'ghost' ? variants[variant] : '', sizes[size], className)}
        style={variant === 'danger' ? { background: 'rgba(239,68,68,0.08)' } : undefined}
        {...props}>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

// ── Badge ─────────────────────────────────────────────────────
interface BadgeProps { children: ReactNode; color?: 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'purple' | 'violet' }
export function Badge({ children, color = 'gray' }: BadgeProps) {
  const colors: Record<string, { bg: string; text: string }> = {
    green:  { bg: 'rgba(16,185,129,0.12)',  text: '#34d399' },
    red:    { bg: 'rgba(239,68,68,0.12)',   text: '#f87171' },
    yellow: { bg: 'rgba(245,158,11,0.12)',  text: '#fbbf24' },
    blue:   { bg: 'rgba(6,182,212,0.12)',   text: '#22d3ee' },
    purple: { bg: 'rgba(139,92,246,0.12)',  text: '#a78bfa' },
    violet: { bg: 'rgba(139,92,246,0.12)',  text: '#a78bfa' },
    gray:   { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-secondary)' },
  }
  const c = colors[color] || colors.gray
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  )
}

// ── Modal ────────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}
export function Modal({ open, onClose, title, children, maxWidth = '480px' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full rounded-2xl p-6 animate-scale-in backdrop-blur-2xl"
           style={{
             maxWidth,
             background: 'rgba(18, 18, 30, 0.95)',
             border: '1px solid var(--glass-border)',
             boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
           }}>
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: 'var(--text-tertiary)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────
interface TabsProps {
  tabs: Array<{ id: string; label: string; count?: number }>
  active: string
  onChange: (id: string) => void
}
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex rounded-xl p-1 gap-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
                className="flex items-center gap-1.5 flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: active === t.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: active === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  ...(active === t.id ? { boxShadow: '0 2px 8px rgba(0,0,0,0.2)' } : {}),
                }}>
          {t.label}
          {t.count !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: active === t.id ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                    color: active === t.id ? '#22d3ee' : 'var(--text-tertiary)',
                  }}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────
interface SelectProps {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
}
export function Select({ value, onChange, options, placeholder }: SelectProps) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
              className="glass-input appearance-none pr-10 cursor-pointer"
              style={{ fontSize: '14px' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                   style={{ color: 'var(--text-tertiary)' }} />
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────
interface ToggleProps { enabled?: boolean; checked?: boolean; onChange: (v: boolean) => void; label?: string }
export function Toggle({ enabled, checked, onChange, label }: ToggleProps) {
  const on = enabled ?? checked ?? false
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button onClick={() => onChange(!on)}
              className="relative w-11 h-6 rounded-full transition-all duration-300"
              style={{
                background: on ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.08)',
              }}>
        <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300"
              style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
      {label && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>}
    </label>
  )
}

// ── EmptyState ────────────────────────────────────────────────
interface EmptyStateProps { icon: ReactNode; title: string; description?: string; action?: ReactNode }
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 gradient-border"
           style={{ background: 'rgba(6,182,212,0.05)' }}>
        {icon}
      </div>
      <h3 className="font-semibold text-[15px] mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>{description}</p>}
      {action}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function SkeletonCard({ height = 'h-32' }: { height?: string }) {
  return <div className={`${height} skeleton rounded-2xl`} />
}

export function SkeletonText({ width = 'w-32' }: { width?: string }) {
  return <div className={`h-4 ${width} skeleton rounded`} />
}

// ── Legacy compat: Card ───────────────────────────────────────
interface CardProps { children: ReactNode; className?: string; padding?: boolean; [k: string]: any }
export function Card({ children, className = '', padding = true, ...props }: CardProps) {
  return (
    <div className={`glass-card ${padding ? '' : '!p-0'} ${className}`} {...props}>
      {children}
    </div>
  )
}

// ── Legacy compat: Skeleton ───────────────────────────────────
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

// ── Legacy compat: Input ──────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', ...props }, ref) => (
    <div>
      {label && <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>{label}</label>}
      <input ref={ref} className={`glass-input ${className}`} {...props} />
    </div>
  )
)
Input.displayName = 'Input'

// ── Legacy compat: Empty ──────────────────────────────────────
export function Empty({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <EmptyState icon={icon || <span style={{ color: 'var(--text-tertiary)', fontSize: 24 }}>∅</span>} title={title} description={description} action={action} />
}
