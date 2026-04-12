'use client'

import { useEffect, useRef, useState } from 'react'

interface CityStat {
  city: string
  country: string
  lat: number
  lon: number
  count: number
}

declare global {
  interface Window {
    ymaps: any
  }
}

export default function UsersMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [cities, setCities] = useState<CityStat[]>([])
  const [loading, setLoading] = useState(true)
  const mapInstance = useRef<any>(null)

  // Load aggregated geo stats
  useEffect(() => {
    fetch('/api/admin/users/geo-stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { cities: [] })
      .then(d => { setCities(d.cities || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Inject Yandex Maps API script
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.ymaps) return
    if (document.getElementById('yandex-maps-script')) return

    const key = process.env.NEXT_PUBLIC_YANDEX_KEY || ''
    if (!key) return

    const script = document.createElement('script')
    script.id = 'yandex-maps-script'
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${key}&lang=ru_RU`
    script.async = true
    document.head.appendChild(script)
  }, [])

  // Init map once we have data + ymaps loaded
  useEffect(() => {
    if (!mapRef.current || cities.length === 0) return
    if (typeof window === 'undefined') return

    let cancelled = false
    let pollTimer: any = null

    const waitForYmaps = () => {
      if (cancelled) return
      if (!window.ymaps || typeof window.ymaps.ready !== 'function') {
        pollTimer = setTimeout(waitForYmaps, 100)
        return
      }
      window.ymaps.ready(() => {
        if (cancelled || !mapRef.current) return

        // Destroy previous instance if any
        if (mapInstance.current) {
          try { mapInstance.current.destroy() } catch {}
          mapInstance.current = null
        }

        const map = new window.ymaps.Map(mapRef.current, {
          center: [55.7558, 37.6173], // Moscow default
          zoom: 4,
          controls: ['zoomControl', 'fullscreenControl'],
        }, {
          suppressMapOpenBlock: true,
        })
        mapInstance.current = map

        // Background color (dark theme hint)
        try {
          map.options.set('backgroundColor', '#0b1121')
        } catch {}

        const maxCount = Math.max(...cities.map(c => c.count), 1)

        cities.forEach(city => {
          const radius = Math.max(6, Math.min(30, Math.sqrt(city.count / maxCount) * 30))
          const placemark = new window.ymaps.Placemark(
            [city.lat, city.lon],
            {
              balloonContentHeader: `<b>${city.city}</b>`,
              balloonContentBody:
                `${city.country || ''}<br/>` +
                `<span style="color:#06b6d4">${city.count} пользователей</span>`,
              hintContent: `${city.city}: ${city.count}`,
            },
            {
              preset: 'islands#circleIcon',
              iconColor: '#06b6d4',
              iconContentColor: '#ffffff',
              // radius visual hint via iconImageSize (best-effort)
              iconImageSize: [Math.round(radius * 2), Math.round(radius * 2)],
            },
          )
          map.geoObjects.add(placemark)
        })

        // Fit bounds over all placemarks
        try {
          const bounds = map.geoObjects.getBounds()
          if (bounds) {
            map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 })
          }
        } catch {}
      })
    }

    waitForYmaps()

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      if (mapInstance.current) {
        try { mapInstance.current.destroy() } catch {}
        mapInstance.current = null
      }
    }
  }, [cities])

  if (loading) {
    return <div className="h-[600px] rounded-2xl skeleton" />
  }

  if (cities.length === 0) {
    return (
      <div className="h-[600px] rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <div className="text-center" style={{ color: 'var(--text-tertiary)' }}>
          <p className="text-sm">Нет гео-данных</p>
          <p className="text-xs mt-1">Данные появятся после первых заходов пользователей в личный кабинет</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div ref={mapRef} className="h-[600px] rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--glass-border)' }} />

      {/* Top cities list */}
      <div className="rounded-2xl p-4"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Топ городов</h3>
        <div className="space-y-1.5">
          {cities.slice(0, 10).map((c, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg"
              style={{ background: 'var(--surface-1)' }}>
              <div>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.city}</span>
                <span className="ml-1.5" style={{ color: 'var(--text-tertiary)' }}>{c.country}</span>
              </div>
              <span className="font-semibold" style={{ color: 'var(--accent-1)' }}>{c.count} 👥</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
