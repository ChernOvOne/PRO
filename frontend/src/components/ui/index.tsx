'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
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
    const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
    const variants = {
      primary:   'bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white',
      secondary: 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700',
      ghost:     'text-gray-400 hover:text-white hover:bg-white/5',
      danger:    'bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-500/20',
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
        className={clsx(base, variants[variant], sizes[size], className)}
        {...props}>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

// ── Badge ─────────────────────────────────────────────────────
interface BadgeProps { children: ReactNode; color?: 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'purple' }
export function Badge({ children, color = 'gray' }: BadgeProps) {
  const colors = {
    green:  'bg-emerald-500/15 text-emerald-400',
    red:    'bg-red-500/15 text-red-400',
    yellow: 'bg-yellow-500/15 text-yellow-400',
    blue:   'bg-blue-500/15 text-blue-400',
    gray:   'bg-gray-500/15 text-gray-400',
    purple: 'bg-purple-500/15 text-purple-400',
  }
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colors[color])}>
      {children}
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────
interface CardProps { children: ReactNode; className?: string; padding?: boolean }
export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div className={clsx('bg-gray-900 border border-gray-800 rounded-2xl', padding && 'p-6', className)}>
      {children}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('bg-gray-800 rounded-lg animate-pulse', className)} />
}

// ── Modal ─────────────────────────────────────────────────────
interface ModalProps {
  open:      boolean
  onClose:   () => void
  title?:    string
  children:  ReactNode
  maxWidth?: string
}
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        'relative w-full bg-gray-900 border border-gray-800 rounded-2xl p-6',
        'max-h-[90vh] overflow-y-auto space-y-5 animate-slide-up',
        maxWidth,
      )}>
        {title && (
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">{title}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl',
        'text-white placeholder-gray-500',
        'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50',
        'transition-colors disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

// ── Select ────────────────────────────────────────────────────
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl',
        'text-white focus:outline-none focus:border-brand-500',
        'transition-colors cursor-pointer',
        className,
      )}
      {...props}>
      {children}
    </select>
  )
)
Select.displayName = 'Select'

// ── Toggle ────────────────────────────────────────────────────
interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string }
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative w-10 h-6 rounded-full transition-colors duration-200',
          checked ? 'bg-brand-600' : 'bg-gray-700',
        )}>
        <div className={clsx(
          'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-1',
        )} />
      </div>
      {label && <span className="text-sm text-gray-300">{label}</span>}
    </label>
  )
}

// ── Empty state ───────────────────────────────────────────────
interface EmptyProps { icon?: ReactNode; title: string; description?: string; action?: ReactNode }
export function Empty({ icon, title, description, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center text-gray-600">
          {icon}
        </div>
      )}
      <div>
        <p className="font-medium text-gray-300">{title}</p>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  )
}
