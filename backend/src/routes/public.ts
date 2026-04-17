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
      },
    }),
  )

  // Platform config for frontend
  app.get('/config', async () => ({
    features:    config.features,
    botName:     config.telegram.botName,
    domain:      config.domain,
    referralBonusDays: config.referral.bonusDays,
  }))

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
      'brand_color', 'brand_color_secondary', 'currency_symbol',
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
