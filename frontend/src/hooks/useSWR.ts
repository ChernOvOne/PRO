import useSWR, { type SWRConfiguration } from 'swr'
import {
  userApi, publicApi, paymentsApi, adminApi,
} from '@/lib/api'

// ── Base fetcher ──────────────────────────────────────────────
const fetcher = async (key: string) => {
  const map: Record<string, () => Promise<unknown>> = {
    '/user/dashboard':    userApi.dashboard,
    '/user/subscription': userApi.subscription,
    '/user/instructions': userApi.instructions,
    '/user/payments':     userApi.payments,
    '/user/referral':     userApi.referral,
    '/public/tariffs':    publicApi.tariffs,
    '/admin/stats':       adminApi.stats,
    '/admin/tariffs':     adminApi.tariffs,
    '/admin/instructions': adminApi.instructions,
    '/admin/settings':    adminApi.settings,
    '/admin/import':      adminApi.importStatus,
  }
  const fn = map[key]
  if (!fn) throw new Error(`Unknown SWR key: ${key}`)
  return fn()
}

const DEFAULT_CONFIG: SWRConfiguration = {
  revalidateOnFocus:       false,
  revalidateOnReconnect:   true,
  dedupingInterval:        30_000,
  errorRetryCount:         3,
}

// ── User hooks ────────────────────────────────────────────────
export function useDashboard() {
  return useSWR('/user/dashboard', fetcher, DEFAULT_CONFIG)
}

export function useSubscription() {
  return useSWR('/user/subscription', fetcher, {
    ...DEFAULT_CONFIG,
    refreshInterval: 60_000, // refresh every minute when active
  })
}

export function useInstructions() {
  return useSWR('/user/instructions', fetcher, {
    ...DEFAULT_CONFIG,
    revalidateIfStale: false,
  })
}

export function usePaymentHistory() {
  return useSWR('/user/payments', fetcher, DEFAULT_CONFIG)
}

export function useReferral() {
  return useSWR('/user/referral', fetcher, DEFAULT_CONFIG)
}

// ── Public hooks ──────────────────────────────────────────────
export function useTariffs() {
  return useSWR('/public/tariffs', fetcher, {
    ...DEFAULT_CONFIG,
    revalidateIfStale: false,
    dedupingInterval:  5 * 60_000, // 5 min cache
  })
}

// ── Admin hooks ───────────────────────────────────────────────
export function useAdminStats() {
  return useSWR('/admin/stats', fetcher, {
    ...DEFAULT_CONFIG,
    refreshInterval: 30_000,
  })
}

export function useAdminTariffs() {
  return useSWR('/admin/tariffs', fetcher, DEFAULT_CONFIG)
}

export function useAdminInstructions() {
  return useSWR('/admin/instructions', fetcher, DEFAULT_CONFIG)
}

export function useAdminSettings() {
  return useSWR('/admin/settings', fetcher, DEFAULT_CONFIG)
}

export function useImportStatus() {
  return useSWR('/admin/import', fetcher, {
    ...DEFAULT_CONFIG,
    refreshInterval: 10_000,
  })
}
