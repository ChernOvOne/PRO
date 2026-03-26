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
}
