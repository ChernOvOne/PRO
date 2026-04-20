import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi } from '@/lib/api'

export interface SetupState {
  /* Group 1 — Identity */
  branding: {
    app_name: string
    description: string
    support_email: string
    primary_color: string
    logo_url?: string
  }

  /* Group 2 — Finance */
  payments: {
    yukassa_shop_id: string
    yukassa_secret_key: string
    yukassa_test_mode: boolean
    crypto_token: string
    balance_min: number
    balance_max: number
    auto_confirm: boolean
  }
  smtp: {
    host: string
    port: string
    user: string
    password: string
    encryption: 'none' | 'tls' | 'ssl'
    from_email: string
    from_name: string
  }
  referrals: {
    enabled: boolean
    inviter_days: number
    invitee_days: number
    max_monthly: number
  }

  /* Group 3 — VPN */
  remnawave: {
    url: string
    token: string
    username_prefix: string
    auto_create: boolean
  }
  bot: {
    token: string
    username: string
    admin_id: string
    notify_channel_id: string
    welcome_text: string
  }

  /* Group 4 — Accounting */
  buh: {
    currency: 'RUB' | 'USD' | 'EUR'
    timezone: string
    starting_balance: number
    company_name: string
    sources: Array<{ label: string; amount: number }>
    categories: Array<{ name: string; color: string; icon?: string; enabled: boolean }>
    servers: Array<{ name: string; provider: string; monthlyCost: number; paymentDay: number; ip?: string }>
    saas: Array<{ name: string; cost: number; period: 'month' | 'year'; nextPayment?: string }>
    importSummary?: { totalIncome?: number; totalExpense?: number; userCount?: number; paymentCount?: number }
  }

  /* Progress tracking */
  completedGroups: string[] // ids: identity | finance | vpn | accounting
}

export const EMPTY_STATE: SetupState = {
  branding: {
    app_name: 'HIDEYOU',
    description: 'Private. Fast. Reliable.',
    support_email: '',
    primary_color: '#06b6d4',
  },
  payments: {
    yukassa_shop_id: '',
    yukassa_secret_key: '',
    yukassa_test_mode: true,
    crypto_token: '',
    balance_min: 50,
    balance_max: 100000,
    auto_confirm: true,
  },
  smtp: {
    host: '',
    port: '587',
    user: '',
    password: '',
    encryption: 'tls',
    from_email: '',
    from_name: '',
  },
  referrals: {
    enabled: true,
    inviter_days: 7,
    invitee_days: 3,
    max_monthly: 0,
  },
  remnawave: {
    url: '',
    token: '',
    username_prefix: 'hy',
    auto_create: true,
  },
  bot: {
    token: '',
    username: '',
    admin_id: '',
    notify_channel_id: '',
    welcome_text: 'Добро пожаловать! 🚀',
  },
  buh: {
    currency: 'RUB',
    timezone: 'Europe/Moscow',
    starting_balance: 0,
    company_name: '',
    sources: [],
    categories: [],
    servers: [],
    saas: [],
  },
  completedGroups: [],
}

/** Deep-merge helper for partial patches. */
function deepMerge<T>(base: T, patch: any): T {
  if (!patch || typeof patch !== 'object') return base
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

export function useSetupState() {
  const [state, setState] = useState<SetupState>(EMPTY_STATE)
  const [loaded, setLoaded] = useState(false)
  const [completed, setCompleted] = useState(false)
  const saveTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const { progress, completed } = await adminApi.setupGetProgress()
      setCompleted(completed)
      if (progress && Object.keys(progress).length) {
        setState(prev => deepMerge(prev, progress))
      }
      // Pull current settings to pre-fill
      try {
        const settings = await adminApi.getSettings()
        setState(prev => ({
          ...prev,
          branding: {
            ...prev.branding,
            app_name: settings.app_name || prev.branding.app_name,
            description: settings.app_description || prev.branding.description,
            support_email: settings.support_email || prev.branding.support_email,
            primary_color: settings.primary_color || prev.branding.primary_color,
            logo_url: settings.logo_url || prev.branding.logo_url,
          },
          payments: {
            ...prev.payments,
            yukassa_shop_id: settings.yukassa_shop_id || prev.payments.yukassa_shop_id,
            yukassa_secret_key: settings.yukassa_secret_key || prev.payments.yukassa_secret_key,
            yukassa_test_mode: settings.yukassa_test_mode === '1' || prev.payments.yukassa_test_mode,
            crypto_token: settings.crypto_token || prev.payments.crypto_token,
          },
          smtp: {
            ...prev.smtp,
            host: settings.smtp_host || prev.smtp.host,
            port: settings.smtp_port || prev.smtp.port,
            user: settings.smtp_user || prev.smtp.user,
            password: settings.smtp_password || prev.smtp.password,
            from_email: settings.from_email || prev.smtp.from_email,
            from_name: settings.from_name || prev.smtp.from_name,
          },
          remnawave: {
            ...prev.remnawave,
            url: settings.remnawave_url || prev.remnawave.url,
            token: settings.remnawave_token || prev.remnawave.token,
            username_prefix: settings.remnawave_username_prefix || prev.remnawave.username_prefix,
          },
          bot: {
            ...prev.bot,
            token: settings.bot_token || prev.bot.token,
            username: settings.bot_username || prev.bot.username,
            admin_id: settings.bot_admin_id || prev.bot.admin_id,
            notify_channel_id: settings.notify_channel_id || prev.bot.notify_channel_id,
          },
        }))
      } catch { /* first-run: ignore */ }
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** Patch state and schedule save (debounced). */
  const patch = useCallback((p: Partial<SetupState> | ((prev: SetupState) => Partial<SetupState>)) => {
    setState(prev => {
      const patchValue = typeof p === 'function' ? p(prev) : p
      return deepMerge(prev, patchValue)
    })
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      setState(currentState => {
        adminApi.setupSaveProgress(currentState).catch(() => {})
        return currentState
      })
    }, 600)
  }, [])

  const markGroupComplete = useCallback((groupId: string) => {
    setState(prev => ({
      ...prev,
      completedGroups: Array.from(new Set([...prev.completedGroups, groupId])),
    }))
  }, [])

  return {
    state, patch, loaded, completed,
    markGroupComplete,
    reload: load,
  }
}
