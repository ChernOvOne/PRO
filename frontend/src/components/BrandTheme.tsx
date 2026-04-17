'use client'

/**
 * Applies brand theme (colors, font, border radius) from useBrand() to CSS variables
 * on document root. Rendered once in layout — re-runs when brand cache changes.
 */

import { useEffect } from 'react'
import { useBrand } from '@/hooks/useBrand'

export function BrandTheme() {
  const brand = useBrand() as any

  useEffect(() => {
    const root = document.documentElement
    if (brand.brand_color) {
      root.style.setProperty('--accent-1', brand.brand_color)
    }
    if (brand.brand_color_secondary) {
      root.style.setProperty('--accent-2', brand.brand_color_secondary)
    }
    if (brand.brand_color && brand.brand_color_secondary) {
      root.style.setProperty('--accent-gradient',
        `linear-gradient(135deg, ${brand.brand_color} 0%, ${brand.brand_color_secondary} 100%)`)
    }
    if (brand.brand_font) {
      root.style.setProperty('--brand-font', brand.brand_font)
      // inject Google Fonts link dynamically
      const existing = document.getElementById('brand-font-link')
      if (existing) existing.remove()
      const link = document.createElement('link')
      link.id = 'brand-font-link'
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.brand_font)}:wght@400;500;600;700;800&display=swap`
      document.head.appendChild(link)
      document.body.style.fontFamily = `"${brand.brand_font}", -apple-system, sans-serif`
    }
    if (brand.brand_radius) {
      root.style.setProperty('--brand-radius', brand.brand_radius + 'px')
    }
    if (brand.app_favicon_url) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = brand.app_favicon_url
    }
  }, [brand])

  return null
}
