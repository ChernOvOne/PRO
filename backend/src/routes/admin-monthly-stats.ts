import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminMonthlyStatsRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ─────────────────────────────────────────────────────────
  //  LIST MONTHLY STATS FOR A YEAR
  // ─────────────────────────────────────────────────────────
  app.get('/', editor, async (req) => {
    const q = req.query as { year?: string }
    const year = Number(q.year) || new Date().getFullYear()

    return prisma.buhMonthlyStats.findMany({
      where: { year },
      orderBy: { month: 'asc' },
    })
  })

  // ─────────────────────────────────────────────────────────
  //  UPSERT MONTHLY STATS
  // ─────────────────────────────────────────────────────────
  app.put('/:year/:month', editor, async (req) => {
    const params = z
      .object({
        year:  z.coerce.number().int().min(2000).max(2100),
        month: z.coerce.number().int().min(1).max(12),
      })
      .parse(req.params)

    const body = z
      .object({
        onlineCount:   z.coerce.number().int().optional(),
        onlineWeekly:  z.coerce.number().int().optional(),
        pdpInChannel:  z.coerce.number().int().optional(),
        avgCheck:      z.coerce.number().optional(),
        totalPayments: z.coerce.number().int().optional(),
        totalRefunds:  z.coerce.number().optional(),
        tagPaid:       z.coerce.number().int().optional(),
        notes:         z.string().optional(),
      })
      .parse(req.body)

    return prisma.buhMonthlyStats.upsert({
      where: {
        year_month: { year: params.year, month: params.month },
      },
      create: {
        year:  params.year,
        month: params.month,
        ...body,
      },
      update: body,
    })
  })
}
