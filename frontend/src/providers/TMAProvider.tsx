'use client'

import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'

interface TMAContext {
  isTMA:     boolean
  tgUser:    TelegramUser | null
  platform:  string
  colorScheme: 'light' | 'dark'
  ready:     () => void
  expand:    () => void
  close:     () => void
  haptic:    {
    impact:   (style?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    success:  () => void
    error:    () => void
    warning:  () => void
  }
}

interface TelegramUser {
  id:         number
  first_name: string
  last_name?: string
  username?:  string
  language_code?: string
  photo_url?: string
}

const TMACtx = createContext<TMAContext>({
  isTMA:       false,
  tgUser:      null,
  platform:    'unknown',
  colorScheme: 'dark',
  ready:       () => {},
  expand:      () => {},
  close:       () => {},
  haptic: {
    impact:  () => {},
    success: () => {},
    error:   () => {},
    warning: () => {},
  },
})

export function useTMA() {
  return useContext(TMACtx)
}

export function TMAProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<TMAContext>({
    isTMA:       false,
    tgUser:      null,
    platform:    'web',
    colorScheme: 'dark',
    ready:       () => {},
    expand:      () => {},
    close:       () => {},
    haptic: {
      impact:  () => {},
      success: () => {},
      error:   () => {},
      warning: () => {},
    },
  })

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (!tg) return

    // Signal to Telegram that the app is ready
    tg.ready()
    tg.expand()

    // Apply Telegram color scheme to document
    const scheme = tg.colorScheme as 'light' | 'dark'
    document.documentElement.setAttribute('data-theme', scheme)
    if (tg.themeParams?.bg_color) {
      document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color)
    }

    // Safe area for notched phones
    if (tg.safeAreaInset) {
      document.documentElement.style.setProperty(
        '--tg-safe-top', `${tg.safeAreaInset.top}px`,
      )
    }

    const haptic = {
      impact:  (style = 'light') => tg.HapticFeedback?.impactOccurred(style),
      success: () => tg.HapticFeedback?.notificationOccurred('success'),
      error:   () => tg.HapticFeedback?.notificationOccurred('error'),
      warning: () => tg.HapticFeedback?.notificationOccurred('warning'),
    }

    setCtx({
      isTMA:       true,
      tgUser:      tg.initDataUnsafe?.user ?? null,
      platform:    tg.platform ?? 'tdesktop',
      colorScheme: scheme,
      ready:       () => tg.ready(),
      expand:      () => tg.expand(),
      close:       () => tg.close(),
      haptic,
    })

    // Handle back button in Mini App
    tg.BackButton?.onClick(() => window.history.back())
    if (window.location.pathname !== '/dashboard') {
      tg.BackButton?.show()
    }
  }, [])

  return <TMACtx.Provider value={ctx}>{children}</TMACtx.Provider>
}

/**
 * Hook: auto-authenticate using Telegram initData when in Mini App
 * Returns { loading, error } — redirects to /dashboard on success
 */
export function useTMAAuth() {
  const { isTMA, tgUser } = useTMA()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!isTMA || !tgUser) return

    const tg = (window as any).Telegram?.WebApp
    const initData = tg?.initData

    if (!initData) return

    setLoading(true)

    // Validate initData with our backend
    fetch('/api/auth/telegram-mini-app', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ initData }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        // Auth successful — page will re-render with user loaded
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [isTMA, tgUser])

  return { loading, error }
}
