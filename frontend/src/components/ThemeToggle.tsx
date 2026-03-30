'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  if (compact) {
    // Simple toggle button
    return (
      <button
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        className="p-2 rounded-xl transition-all hover:bg-white/[0.05]"
        style={{ color: 'var(--text-secondary)' }}
        title={resolvedTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      >
        {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    )
  }

  // 3-option selector
  const options = [
    { value: 'light', icon: Sun, label: 'Светлая' },
    { value: 'dark', icon: Moon, label: 'Тёмная' },
    { value: 'system', icon: Monitor, label: 'Авто' },
  ] as const

  return (
    <div className="flex rounded-xl p-0.5 gap-0.5" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: theme === value ? 'var(--accent-gradient)' : 'transparent',
            color: theme === value ? '#fff' : 'var(--text-tertiary)',
          }}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}
