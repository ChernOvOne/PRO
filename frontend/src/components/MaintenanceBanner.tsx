'use client'

import { useEffect, useState } from 'react'

export function MaintenanceBanner() {
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setActive(!!data.maintenance)
            setMessage(data.maintenanceMessage || null)
          }
        }
      } catch {
        /* ignore */
      }
    }
    poll()
    const id = setInterval(poll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!active) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-center text-sm font-medium"
         style={{
           background: 'linear-gradient(90deg, #f59e0b, #f97316)',
           color: 'white',
           boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
         }}>
      {message || '🔧 Платформа обновляется. Это займёт 3-5 минут. Скоро вернёмся!'}
    </div>
  )
}
