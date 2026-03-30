import type { FastifyInstance } from 'fastify'
import { z }      from 'zod'
import { prisma } from '../db'

export async function proxyRoutes(app: FastifyInstance) {
  // Public: list active proxies (for authenticated users)
  app.get('/', { preHandler: [app.authenticate] }, async () => {
    return prisma.telegramProxy.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
  })
}

export async function adminProxyRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  const ProxySchema = z.object({
    name:        z.string().min(1),
    description: z.string().optional().nullable(),
    tgLink:      z.string().optional().nullable(),
    httpsLink:   z.string().optional().nullable(),
    tag:         z.string().optional().nullable(),
    isActive:    z.boolean().default(true),
    sortOrder:   z.coerce.number().default(0),
  })

  // List all proxies (including inactive)
  app.get('/', admin, async () => {
    return prisma.telegramProxy.findMany({ orderBy: { sortOrder: 'asc' } })
  })

  // Create proxy
  app.post('/', admin, async (req, reply) => {
    const data  = ProxySchema.parse(req.body)
    const proxy = await prisma.telegramProxy.create({ data })
    return reply.status(201).send(proxy)
  })

  // Update proxy
  app.put('/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    const data   = ProxySchema.partial().parse(req.body)
    return prisma.telegramProxy.update({ where: { id }, data })
  })

  // Delete proxy
  app.delete('/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.telegramProxy.delete({ where: { id } })
    return { ok: true }
  })
}
