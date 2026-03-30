import type { FastifyInstance } from 'fastify'
import { z }      from 'zod'
import { prisma } from '../db'

export async function adminLandingRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // Get all landing sections
  app.get('/sections', admin, async () => {
    return prisma.setting.findMany({
      where: { key: { startsWith: 'landing.' } },
    })
  })

  // Get specific section
  app.get('/sections/:key', admin, async (req, reply) => {
    const { key } = req.params as { key: string }
    const fullKey = key.startsWith('landing.') ? key : `landing.${key}`
    const setting = await prisma.setting.findUnique({ where: { key: fullKey } })
    if (!setting) return reply.status(404).send({ error: 'Section not found' })
    return { key: setting.key, value: JSON.parse(setting.value) }
  })

  // Upsert section
  app.put('/sections/:key', admin, async (req) => {
    const { key } = req.params as { key: string }
    const fullKey  = key.startsWith('landing.') ? key : `landing.${key}`
    const { value } = req.body as { value: any }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value)

    const setting = await prisma.setting.upsert({
      where:  { key: fullKey },
      create: { key: fullKey, value: serialized },
      update: { value: serialized },
    })

    return { ok: true, key: setting.key }
  })

  // Delete section
  app.delete('/sections/:key', admin, async (req) => {
    const { key } = req.params as { key: string }
    const fullKey = key.startsWith('landing.') ? key : `landing.${key}`
    await prisma.setting.delete({ where: { key: fullKey } }).catch(() => {})
    return { ok: true }
  })
}
