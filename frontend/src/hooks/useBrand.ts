'use client'

import { useEffect, useState } from 'react'
import { publicApi } from '@/lib/api'

export interface Brand {
  app_name: string
  app_description: string
  app_logo_url?: string
  app_favicon_url?: string
  brand_color: string
  brand_color_secondary: string
  brand_font?: string
  brand_radius?: string
  currency_symbol: string
  domain?: string
  app_url?: string
  support_url?: string
  channel_url?: string
  bot_url?: string
  terms_url?: string
  privacy_url?: string
  footer_text?: string
  telegram_channel_name?: string
}

const DEFAULT_BRAND: Brand = {
  app_name: 'HIDEYOU',
  app_description: 'VPN сервис',
  brand_color: '#06b6d4',
  brand_color_secondary: '#8b5cf6',
  currency_symbol: '₽',
}

let cache: Brand | null = null
let cachePromise: Promise<Brand> | null = null

async function fetchBrand(): Promise<Brand> {
  if (cache) return cache
  if (cachePromise) return cachePromise
  cachePromise = publicApi.brand()
    .then((data): Brand => {
      const result: Brand = { ...DEFAULT_BRAND, ...(data as any) }
      cache = result
      return result
    })
    .catch((): Brand => DEFAULT_BRAND)
  return cachePromise
}

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(cache || DEFAULT_BRAND)
  useEffect(() => {
    if (cache) { setBrand(cache); return }
    fetchBrand().then(setBrand)
  }, [])
  return brand
}

export function clearBrandCache() {
  cache = null
  cachePromise = null
}
