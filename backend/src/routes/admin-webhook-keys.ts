import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'node:crypto'
import { prisma } from '../db'

export async function adminWebhookKeyRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── GET / — list all API keys ──────────────────────────────
  app.get('/', admin, async () => {
    return prisma.buhWebhookApiKey.findMany({
      orderBy: { createdAt: 'desc' },
    })
  })

  // ── POST / — create a new API key ─────────────────────────
  app.post('/', admin, async (req) => {
    const body = z.object({ name: z.string() }).parse(req.body)

    const key = crypto.randomBytes(32).toString('hex')

    return prisma.buhWebhookApiKey.create({
      data: { name: body.name, key },
    })
  })

  // ── DELETE /:id — soft-delete (deactivate) ─────────────────
  app.delete('/:id', admin, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)

    return prisma.buhWebhookApiKey.update({
      where: { id },
      data: { isActive: false },
    })
  })
}
