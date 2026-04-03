import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminMilestoneRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }
  const staff = { preHandler: [app.requireStaff] }

  // ─────────────────────────────────────────────────────────
  //  LIST MILESTONES (non-completed)
  // ─────────────────────────────────────────────────────────
  app.get('/', staff, async () => {
    const milestones = await prisma.buhMilestone.findMany({
      where: { isCompleted: false },
      orderBy: { createdAt: 'desc' },
    })

    return milestones.map((m) => ({
      ...m,
      targetAmount:    Number(m.targetAmount),
      currentAmount:   Number(m.currentAmount),
      progressPercent: Math.min(
        100,
        Number(m.targetAmount) > 0
          ? Math.round((Number(m.currentAmount) / Number(m.targetAmount)) * 10000) / 100
          : 0,
      ),
    }))
  })

  // ─────────────────────────────────────────────────────────
  //  CREATE MILESTONE
  // ─────────────────────────────────────────────────────────
  app.post('/', admin, async (req, reply) => {
    const body = z
      .object({
        title:         z.string().min(1),
        targetAmount:  z.coerce.number(),
        type:          z.enum(['revenue', 'profit', 'investment_return']).default('revenue'),
        currentAmount: z.coerce.number().default(0),
      })
      .parse(req.body)

    const milestone = await prisma.buhMilestone.create({
      data: {
        title:         body.title,
        targetAmount:  body.targetAmount,
        currentAmount: body.currentAmount,
        type:          body.type,
      },
    })

    return reply.status(201).send({
      ...milestone,
      targetAmount:    Number(milestone.targetAmount),
      currentAmount:   Number(milestone.currentAmount),
      progressPercent: Math.min(
        100,
        Number(milestone.targetAmount) > 0
          ? Math.round((Number(milestone.currentAmount) / Number(milestone.targetAmount)) * 10000) / 100
          : 0,
      ),
    })
  })

  // ─────────────────────────────────────────────────────────
  //  DELETE MILESTONE
  // ─────────────────────────────────────────────────────────
  app.delete('/:id', admin, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await prisma.buhMilestone.delete({ where: { id } })
    return { ok: true }
  })
}
