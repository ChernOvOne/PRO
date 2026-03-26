'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import type { User } from '@/types'

interface UseUserOptions {
  redirectTo?:    string    // redirect here if NOT logged in
  adminRequired?: boolean   // redirect to /dashboard if not admin
}

export function useUser(options: UseUserOptions = {}) {
  const router = useRouter()
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const { redirectTo = '/login', adminRequired = false } = options

  const fetchUser = useCallback(async () => {
    try {
      const u = await authApi.me()
      setUser(u)
      if (adminRequired && u.role !== 'ADMIN') {
        router.replace('/dashboard')
      }
    } catch {
      setError('Unauthorized')
      if (redirectTo) router.replace(redirectTo)
    } finally {
      setLoading(false)
    }
  }, [redirectTo, adminRequired, router])

  useEffect(() => { fetchUser() }, [fetchUser])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
    router.push('/')
  }, [router])

  return { user, loading, error, logout, refetch: fetchUser }
}
