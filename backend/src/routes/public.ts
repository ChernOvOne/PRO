import type { FastifyInstance } from 'fastify'
import { prisma }  from '../db'
import { config }  from '../config'

export async function publicRoutes(app: FastifyInstance) {
  // Tariffs for landing page
  app.get('/tariffs', async () =>
    prisma.tariff.findMany({
      where:   { isActive: true },
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        id: true, name: true, description: true,
        durationDays: true, priceRub: true, priceUsdt: true,
        deviceLimit: true, trafficGb: true, isFeatured: true,
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
