'use client'

/**
 * Applies brand theme (colors, font, border radius) from useBrand() to CSS variables
 * on document root. Rendered once in layout — re-runs when brand cache changes.
 */

import { useEffect } from 'react'
import { useBrand } from '@/hooks/useBrand'

// Predefined palettes — applied when brand_palette_preset is set
const PALETTES: Record<string, { primary: string; secondary: string }> = {
  ocean:      { primary: '#06b6d4', secondary: '#0ea5e9' },
  sunset:     { primary: '#f97316', secondary: '#ec4899' },
  midnight:   { primary: '#8b5cf6', secondary: '#6366f1' },
  forest:     { primary: '#10b981', secondary: '#06b6d4' },
  monochrome: { primary: '#64748b', secondary: '#cbd5e1' },
  fire:       { primary: '#ef4444', secondary: '#f97316' },
}

export function BrandTheme() {
  const brand = useBrand() as any

  useEffect(() => {
    const root = document.documentElement
    const preset = brand.brand_palette_preset && PALETTES[brand.brand_palette_preset]
    const primary   = preset ? preset.primary   : brand.brand_color
    const secondary = preset ? preset.secondary : brand.brand_color_secondary

    if (primary)   root.style.setProperty('--accent-1', primary)
    if (secondary) root.style.setProperty('--accent-2', secondary)
    if (primary && secondary) {
      root.style.setProperty('--accent-gradient',
        `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`)
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
