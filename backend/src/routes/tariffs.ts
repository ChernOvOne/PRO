import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function tariffRoutes(app: FastifyInstance) {
  // ── Public list ────────────────────────────────────────────
  app.get('/', async () => {
    return prisma.tariff.findMany({
      where:   { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
      select: {
        id: true, name: true, description: true,
        durationDays: true, priceRub: true, priceUsdt: true,
        deviceLimit: true, trafficGb: true,
        isFeatured: true, sortOrder: true,
      },
    })
  })

  // ── Single tariff ──────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tariff = await prisma.tariff.findUnique({
      where:  { id, isActive: true },
      select: {
        id: true, name: true, description: true,
        durationDays: true, priceRub: true, priceUsdt: true,
        deviceLimit: true, trafficGb: true, isFeatured: true,
      },
    })
    if (!tariff) return reply.status(404).send({ error: 'Tariff not found' })
    return tariff
  })
}
