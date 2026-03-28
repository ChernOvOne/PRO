import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

const PUBLIC_FIELDS = {
  id: true, name: true, description: true, type: true,
  durationDays: true, priceRub: true, priceUsdt: true,
  deviceLimit: true, trafficGb: true, trafficAddonGb: true,
  trafficStrategy: true, isFeatured: true, sortOrder: true,
} as const

export async function tariffRoutes(app: FastifyInstance) {
  // Public: all active SUBSCRIPTION tariffs
  app.get('/', async () => {
    return prisma.tariff.findMany({
      where:   { isActive: true, type: 'SUBSCRIPTION' },
      orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
      select:  PUBLIC_FIELDS,
    })
  })

  // Public: traffic addons (for "buy more traffic" feature)
  app.get('/addons', async () => {
    return prisma.tariff.findMany({
      where:   { isActive: true, type: 'TRAFFIC_ADDON' },
      orderBy: [{ sortOrder: 'asc' }, { priceRub: 'asc' }],
      select:  PUBLIC_FIELDS,
    })
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tariff = await prisma.tariff.findUnique({
      where:  { id, isActive: true },
      select: PUBLIC_FIELDS,
    })
    if (!tariff) return reply.status(404).send({ error: 'Tariff not found' })
    return tariff
  })
}
