import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '@/types'

// ── Auth store ────────────────────────────────────────────────
interface AuthState {
  user:        User | null
  token:       string | null
  setUser:     (user: User | null) => void
  setToken:    (token: string | null) => void
  clear:       () => void
  isAdmin:     () => boolean
  isActive:    () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:     null,
      token:    null,
      setUser:  (user)  => set({ user }),
      setToken: (token) => set({ token }),
      clear:    ()      => set({ user: null, token: null }),
      isAdmin:  ()      => get().user?.role === 'ADMIN',
      isActive: ()      => get().user?.subStatus === 'ACTIVE',
    }),
    {
      name:    'hideyou-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ user: state.user }), // don't persist token in storage
    },
  ),
)

// ── UI store ─────────────────────────────────────────────────
interface UIState {
  sidebarOpen:    boolean
  setSidebarOpen: (v: boolean) => void
  toggleSidebar:  () => void

  // Global notification banner
  banner:    { type: 'info' | 'warning' | 'error'; message: string } | null
  setBanner: (banner: UIState['banner']) => void
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen:    false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar:  ()  => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  banner:         null,
  setBanner:      (banner) => set({ banner }),
}))

// ── Tariff cache store ─────────────────────────────────────────
import type { Tariff } from '@/types'

interface TariffState {
  tariffs:     Tariff[]
  lastFetched: number | null
  setTariffs:  (t: Tariff[]) => void
  isStale:     () => boolean
}

export const useTariffStore = create<TariffState>()((set, get) => ({
  tariffs:     [],
  lastFetched: null,
  setTariffs:  (tariffs) => set({ tariffs, lastFetched: Date.now() }),
  isStale:     () => {
    const { lastFetched } = get()
    if (!lastFetched) return true
    return Date.now() - lastFetched > 5 * 60_000 // 5 min cache
  },
}))
