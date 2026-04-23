import type { FastifyInstance } from 'fastify'
import { prisma }  from '../db'
import { config }  from '../config'

export async function publicRoutes(app: FastifyInstance) {
  // Tariffs for landing page
  app.get('/tariffs', async () =>
    prisma.tariff.findMany({
      where:   { isActive: true, isVisible: true },
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true, name: true, description: true,
        countries: true, protocol: true, speed: true,
        durationDays: true, priceRub: true, priceUsdt: true,
        deviceLimit: true, trafficGb: true, isFeatured: true,
        mode: true, variants: true, configurator: true,
        paidSquads: true,
      },
    }),
  )

  // Platform config for frontend
  app.get('/config', async () => {
    // Feature toggles live in DB (admin settings UI). Fall back to env-driven
    // config.features.* when the row is missing. Stored as "1"/"0" or "true"/"false".
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['balance_payments_enabled', 'auto_renew_enabled'] } },
    }).catch(() => [])
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.key] = r.value })
    const isOn = (v: string | undefined, fallback: boolean) =>
      v == null ? fallback : (v === '1' || v === 'true')

    return {
      features: {
        ...config.features,
        balance:   isOn(map.balance_payments_enabled, config.features.balance),
        autoRenew: isOn(map.auto_renew_enabled, true),
      },
      botName:     config.telegram.botName,
      domain:      config.domain,
      referralBonusDays: config.referral.bonusDays,
    }
  })

  // Available payment providers for the checkout UI.
  // Only returns providers that are BOTH toggled on AND have credentials.
  app.get('/payment-methods', async () => {
    const rows = await prisma.setting.findMany({
      where: { key: { in: [
        'yukassa_enabled', 'yukassa_shop_id', 'yukassa_secret',
        'crypto_enabled', 'crypto_token',
        'platega_enabled', 'platega_merchant_id', 'platega_secret', 'platega_payment_method',
        'balance_payments_enabled',
      ] } },
    })
    const s: Record<string, string> = {}
    rows.forEach(r => { s[r.key] = r.value })

    const providers: Array<{ id: string; label: string; icon: string; meta?: any }> = []

    // Toggle rows may store "1"/"0" (numeric wizard) or "true"/"false" (admin settings UI)
    const isOn = (v: string | undefined) => v === '1' || v === 'true'

    // Back-compat: if the toggle row is missing, fall back to env-driven config flag
    const yukassaOn = s.yukassa_enabled != null ? isOn(s.yukassa_enabled) : config.yukassa.enabled
    if (yukassaOn && (s.yukassa_shop_id || config.yukassa.enabled)) {
      providers.push({ id: 'YUKASSA', label: 'Карта / СБП', icon: 'credit-card' })
    }

    const cryptoOn = s.crypto_enabled != null ? isOn(s.crypto_enabled) : config.cryptopay.enabled
    if (cryptoOn && (s.crypto_token || config.cryptopay.enabled)) {
      providers.push({ id: 'CRYPTOPAY', label: 'Крипта (USDT/TON/BTC)', icon: 'bitcoin' })
    }

    if (isOn(s.platega_enabled) && s.platega_merchant_id && s.platega_secret) {
      const methodMap: Record<string, string> = {
        '2':  'СБП QR',
        '3':  'ЕРИП',
        '11': 'Карта',
        '12': 'International',
        '13': 'Крипта',
      }
      const pm = s.platega_payment_method || '2'
      providers.push({
        id: 'PLATEGA',
        label: `Platega · ${methodMap[pm] || 'Оплата'}`,
        icon: 'credit-card',
        meta: { paymentMethod: Number(pm) },
      })
    }

    return {
      providers,
      balanceEnabled: s.balance_payments_enabled === '1',
    }
  })

  // Check referral code validity
  app.get('/referral/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    const user = await prisma.user.findUnique({
      where:  { referralCode: code },
      select: { id: true, telegramName: true },
    })
    if (!user) return reply.status(404).send({ valid: false })
    return { valid: true, referrerName: user.telegramName || 'Friend' }
  })

  // ── Brand settings for UI (app_name, colors, urls, logos) ──
  // Safe for public — contains only branding, no secrets.
  app.get('/brand', async () => {
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
    const brand: Record<string, string> = {
      app_name: 'HIDEYOU',
      app_description: 'VPN сервис',
      brand_color: '#06b6d4',
      brand_color_secondary: '#8b5cf6',
      currency_symbol: '₽',
    }
    for (const r of rows) brand[r.key] = r.value || brand[r.key] || ''
    return brand
  })

  // Landing page blocks (new block-based builder). Returns only visible blocks.
  app.get('/landing/blocks', async (req) => {
    const { page = 'main' } = req.query as { page?: string }
    return prisma.landingBlock.findMany({
      where:   { pageKey: page, visible: true },
      orderBy: { sortOrder: 'asc' },
    })
  })

  // Landing page sections
  app.get('/landing', async () => {
    const settings = await prisma.setting.findMany({
      where: { key: { startsWith: 'landing.' } },
    })
    const sections: Record<string, any> = {}
    for (const s of settings) {
      const key = s.key.replace('landing.', '')
      try {
        sections[key] = JSON.parse(s.value)
      } catch {
        sections[key] = s.value
      }
    }
    return sections
  })

  // Free proxies (public)
  app.get('/proxies', async () => {
    return prisma.telegramProxy.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, name: true, description: true,
        tgLink: true, httpsLink: true, tag: true,
      },
    })
  })

  // News for landing (latest published)
  app.get('/news', async (req) => {
    const { limit = '5' } = req.query as Record<string, string>
    return prisma.news.findMany({
      where: {
        isActive:    true,
        publishedAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take: Number(limit),
    })
  })
}
