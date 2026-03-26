import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ── Tailwind class merger ─────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date formatting ────────────────────────────────────────────
export function formatDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleDateString('ru', options)
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleString('ru', {
      day:    'numeric',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const now = Date.now()
  const d   = new Date(date).getTime()
  const diff = now - d

  if (diff < 60_000)           return 'только что'
  if (diff < 3600_000)         return `${Math.floor(diff / 60_000)} мин. назад`
  if (diff < 86400_000)        return `${Math.floor(diff / 3600_000)} ч. назад`
  if (diff < 7 * 86400_000)    return `${Math.floor(diff / 86400_000)} дн. назад`
  return formatDate(date, { day: 'numeric', month: 'short' })
}

// ── Days until expiry ─────────────────────────────────────────
export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86400_000))
}

export function isExpiringSoon(date: string | Date | null | undefined, days = 5): boolean {
  const d = daysUntil(date)
  return d !== null && d <= days && d >= 0
}

// ── Number formatting ─────────────────────────────────────────
export function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru')} ₽`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Б'
  const k     = 1024
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  const i     = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

// ── Duration formatting ────────────────────────────────────────
export function formatDays(days: number): string {
  if (days === 1)   return '1 день'
  if (days <= 4)    return `${days} дня`
  if (days === 30)  return '1 месяц'
  if (days === 60)  return '2 месяца'
  if (days === 90)  return '3 месяца'
  if (days === 180) return '6 месяцев'
  if (days === 365) return '1 год'
  if (days > 365)   return `${(days / 365).toFixed(1)} лет`
  return `${days} дней`
}

// ── Text helpers ──────────────────────────────────────────────
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

export function initials(name: string): string {
  return name
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('')
}

export function displayName(user: {
  telegramName?: string | null
  email?:        string | null
  telegramId?:   string | null
}): string {
  if (user.telegramName) return user.telegramName
  if (user.email)        return user.email.split('@')[0]
  if (user.telegramId)   return `ID ${user.telegramId}`
  return 'Пользователь'
}

// ── Clipboard ─────────────────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity  = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

// ── URL helpers ────────────────────────────────────────────────
export function buildReferralUrl(code: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}?ref=${code}`
}

export function buildTelegramShareUrl(text: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}
