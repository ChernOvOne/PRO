import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminInkasRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }
  const staff  = { preHandler: [app.requireStaff] }

  // ── GET / — list inkas records ──────────────────────────────
  app.get('/', staff, async (req) => {
    const q = req.query as { partner_id?: string }
    const role   = (req.user as any).role
    const userId = (req.user as any).sub

    const where: any = {}

    // INVESTOR / PARTNER — force filter to own partner
    if (role === 'INVESTOR' || role === 'PARTNER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { buhPartnerId: true },
      })
      if (!user?.buhPartnerId) return []
      where.partnerId = user.buhPartnerId
    } else if (q.partner_id) {
      where.partnerId = q.partner_id
    }

    return prisma.buhInkasRecord.findMany({
      where,
      include: { partner: true },
      orderBy: { date: 'desc' },
    })
  })

  // ── POST / — create inkas record ───────────────────────────
  app.post('/', editor, async (req, reply) => {
    const body = z
      .object({
        partnerId:   z.string().uuid(),
        type:        z.enum(['DIVIDEND', 'RETURN_INV', 'INVESTMENT']),
        amount:      z.number(),
        date:        z.string(),
        monthLabel:  z.string().optional(),
        description: z.string().optional(),
      })
      .parse(req.body)

    const record = await prisma.buhInkasRecord.create({
      data: {
        partnerId:   body.partnerId,
        type:        body.type,
        amount:      body.amount,
        date:        new Date(body.date),
        monthLabel:  body.monthLabel ?? null,
        description: body.description ?? null,
        createdById: (req.user as any).sub,
      },
      include: { partner: true },
    })

    return reply.status(201).send(record)
  })

  // ── DELETE /:id — hard delete inkas record ─────────────────
  app.delete('/:id', editor, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await prisma.buhInkasRecord.delete({ where: { id } })
    return { ok: true }
  })
}
