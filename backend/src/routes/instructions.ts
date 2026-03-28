import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

// ── Public: get all platforms with apps and steps ─────────────
export async function instructionRoutes(app: FastifyInstance) {

  // GET /api/instructions/platforms — public, used in LK
  app.get('/platforms', async () => {
    return prisma.instructionPlatform.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        apps: {
          where:   { isActive: true },
          orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
          include: {
            steps: { orderBy: { order: 'asc' } },
          },
        },
      },
    })
  })
}

// ── Admin: CRUD for platforms / apps / steps ──────────────────
export async function adminInstructionRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.adminOnly] }

  // ── Platforms ───────────────────────────────────────────────

  app.get('/platforms', auth, async () => {
    return prisma.instructionPlatform.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        apps: {
          orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
          include: { steps: { orderBy: { order: 'asc' } } },
        },
      },
    })
  })

  app.post('/platforms', auth, async (req, reply) => {
    const { slug, name, icon, sortOrder } = req.body as any
    if (!slug || !name) return reply.status(400).send({ error: 'slug and name required' })
    return prisma.instructionPlatform.create({
      data: { slug, name, icon: icon || '📱', sortOrder: sortOrder || 0 },
    })
  })

  app.patch('/platforms/:id', auth, async (req) => {
    const { id } = req.params as any
    const data = req.body as any
    return prisma.instructionPlatform.update({ where: { id }, data })
  })

  app.delete('/platforms/:id', auth, async (req) => {
    const { id } = req.params as any
    await prisma.instructionPlatform.delete({ where: { id } })
    return { ok: true }
  })

  // ── Apps ────────────────────────────────────────────────────

  app.post('/apps', auth, async (req, reply) => {
    const { platformId, name, icon, isFeatured, storeUrl, deeplink, sortOrder } = req.body as any
    if (!platformId || !name) return reply.status(400).send({ error: 'platformId and name required' })
    return prisma.instructionApp.create({
      data: {
        platformId,
        name,
        icon:       icon       || '🔵',
        isFeatured: isFeatured || false,
        storeUrl:   storeUrl   || null,
        deeplink:   deeplink   || null,
        sortOrder:  sortOrder  || 0,
      },
      include: { steps: true },
    })
  })

  app.patch('/apps/:id', auth, async (req) => {
    const { id } = req.params as any
    const data = req.body as any
    return prisma.instructionApp.update({
      where: { id },
      data,
      include: { steps: true },
    })
  })

  app.delete('/apps/:id', auth, async (req) => {
    const { id } = req.params as any
    await prisma.instructionApp.delete({ where: { id } })
    return { ok: true }
  })

  // ── Steps ────────────────────────────────────────────────────

  app.post('/steps', auth, async (req, reply) => {
    const { appId, order, text, imageUrl } = req.body as any
    if (!appId || !text) return reply.status(400).send({ error: 'appId and text required' })
    return prisma.instructionStep.create({
      data: { appId, order: order || 1, text, imageUrl: imageUrl || null },
    })
  })

  app.patch('/steps/:id', auth, async (req) => {
    const { id } = req.params as any
    const data = req.body as any
    return prisma.instructionStep.update({ where: { id }, data })
  })

  app.delete('/steps/:id', auth, async (req) => {
    const { id } = req.params as any
    await prisma.instructionStep.delete({ where: { id } })
    return { ok: true }
  })

  // Reorder steps within an app
  app.post('/steps/reorder', auth, async (req) => {
    const { steps } = req.body as { steps: Array<{ id: string; order: number }> }
    await Promise.all(steps.map(s =>
      prisma.instructionStep.update({ where: { id: s.id }, data: { order: s.order } })
    ))
    return { ok: true }
  })

  // Upload image for a step (base64 → saves URL, in prod use S3/CDN)
  app.post('/steps/upload-image', auth, async (req, reply) => {
    // In production: upload to S3/Cloudflare R2
    // For now: we just expect imageUrl to be passed directly
    return reply.status(501).send({ error: 'Image upload: configure storage in production' })
  })
}
