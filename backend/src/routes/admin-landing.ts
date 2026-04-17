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

  // ═════════════════════════════════════════════════════════════
  // Landing Page Builder — block-based CRUD
  // ═════════════════════════════════════════════════════════════

  // List all blocks for a page (default: main)
  app.get('/blocks', admin, async (req) => {
    const { page = 'main' } = req.query as { page?: string }
    return prisma.landingBlock.findMany({
      where:   { pageKey: page },
      orderBy: { sortOrder: 'asc' },
    })
  })

  // Create block (appended to end)
  app.post('/blocks', admin, async (req) => {
    const body = z.object({
      pageKey: z.string().default('main'),
      type:    z.string().min(1),
      data:    z.record(z.any()).default({}),
      visible: z.boolean().default(true),
    }).parse(req.body)

    const last = await prisma.landingBlock.findFirst({
      where: { pageKey: body.pageKey }, orderBy: { sortOrder: 'desc' },
    })
    const sortOrder = (last?.sortOrder ?? -1) + 1

    const block = await prisma.landingBlock.create({
      data: { ...body, sortOrder },
    })
    return block
  })

  // Update block (data / visibility)
  app.put('/blocks/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      type:    z.string().optional(),
      data:    z.record(z.any()).optional(),
      visible: z.boolean().optional(),
    }).parse(req.body)

    const existing = await prisma.landingBlock.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Block not found' })

    const block = await prisma.landingBlock.update({ where: { id }, data: body })
    return block
  })

  // Delete block
  app.delete('/blocks/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.landingBlock.delete({ where: { id } }).catch(() => {})
    return { ok: true }
  })

  // Reorder blocks — accepts array of { id, sortOrder }
  app.post('/blocks/reorder', admin, async (req) => {
    const { items } = z.object({
      items: z.array(z.object({ id: z.string(), sortOrder: z.number() })),
    }).parse(req.body)
    await prisma.$transaction(
      items.map(it => prisma.landingBlock.update({
        where: { id: it.id }, data: { sortOrder: it.sortOrder },
      })),
    )
    return { ok: true }
  })
}
