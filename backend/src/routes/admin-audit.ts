import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminAuditRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ─────────────────────────────────────────────────────────
  //  LIST AUDIT LOGS
  // ─────────────────────────────────────────────────────────
  app.get('/', admin, async (req) => {
    const q = req.query as {
      skip?:    string
      limit?:   string
      entity?:  string
      action?:  string
      userId?:  string
    }

    const skip  = Number(q.skip) || 0
    const limit = Number(q.limit) || 50

    const where: any = {}
    if (q.entity) where.entity = q.entity
    if (q.action) where.action = q.action
    if (q.userId) where.userId = q.userId

    const [items, total] = await Promise.all([
      prisma.buhAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, telegramName: true } },
        },
      }),
      prisma.buhAuditLog.count({ where }),
    ])

    return { items, total }
  })
}
