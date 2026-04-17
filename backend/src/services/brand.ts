/**
 * Brand service — reads app_name and other branding settings from DB.
 * Cached for 60 seconds. Call invalidateBrand() after admin setting change.
 */
import { prisma } from '../db'

const TTL_MS = 60_000
let cache: { brand: Record<string, string>; expiresAt: number } | null = null

const DEFAULT: Record<string, string> = {
  app_name: 'HIDEYOU',
  app_description: 'VPN сервис',
  brand_color: '#06b6d4',
  brand_color_secondary: '#8b5cf6',
  currency_symbol: '₽',
  footer_text: '',
  support_url: '',
  channel_url: '',
  bot_url: '',
  domain: '',
}

export async function getBrand(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.brand
  const BRAND_KEYS = [
    'app_name', 'app_description', 'app_logo_url', 'app_favicon_url',
    'brand_color', 'brand_color_secondary', 'brand_palette_preset',
    'brand_font', 'brand_radius', 'currency_symbol',
    'domain', 'api_domain', 'app_url',
    'support_url', 'channel_url', 'bot_url',
    'terms_url', 'privacy_url', 'footer_text',
    'telegram_channel_name',
  ]
  const rows = await prisma.setting.findMany({ where: { key: { in: BRAND_KEYS } } })
  const brand = { ...DEFAULT }
  for (const r of rows) if (r.value) brand[r.key] = r.value
  cache = { brand, expiresAt: Date.now() + TTL_MS }
  return brand
}

export async function getBrandName(): Promise<string> {
  const b = await getBrand()
  return b.app_name || 'HIDEYOU'
}

export function invalidateBrand() {
  cache = null
}
