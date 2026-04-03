import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const RecurringCreateSchema = z.object({
  name:        z.string().min(1),
  categoryId:  z.string().optional().nullable(),
  amount:      z.coerce.number(),
  currency:    z.string().default('RUB'),
  paymentDay:  z.coerce.number().int().min(1).max(31),
  description: z.string().optional().nullable(),
  serverId:    z.string().optional().nullable(),
})

export async function adminRecurringRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ─────────────────────────────────────────────────────────
  //  LIST ACTIVE RECURRING PAYMENTS
  // ─────────────────────────────────────────────────────────
  app.get('/', editor, async () => {
    const items = await prisma.buhRecurringPayment.findMany({
      where:   { isActive: true },
      include: { category: true, server: true },
      orderBy: { paymentDay: 'asc' },
    })

    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth()
    const today = now.getDate()

    return items.map((item) => {
      const day = Math.min(item.paymentDay, 28) // safe cap for short months
      let nextPayment: Date

      if (day >= today) {
        nextPayment = new Date(year, month, day)
      } else {
        nextPayment = new Date(year, month + 1, day)
      }

      const diffMs    = nextPayment.getTime() - now.getTime()
      const daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

      return {
        ...item,
        amount: Number(item.amount),
        daysUntil,
      }
    })
  })

  // ─────────────────────────────────────────────────────────
  //  CREATE RECURRING PAYMENT
  // ─────────────────────────────────────────────────────────
  app.post('/', editor, async (req, reply) => {
    const data = RecurringCreateSchema.parse(req.body)

    const payment = await prisma.buhRecurringPayment.create({
      data: {
        name:        data.name,
        categoryId:  data.categoryId ?? null,
        amount:      data.amount,
        currency:    data.currency,
        paymentDay:  data.paymentDay,
        description: data.description ?? null,
        serverId:    data.serverId ?? null,
      },
      include: { category: true, server: true },
    })

    return reply.status(201).send(payment)
  })

  // ─────────────────────────────────────────────────────────
  //  SOFT DELETE RECURRING PAYMENT
  // ─────────────────────────────────────────────────────────
  app.delete('/:id', editor, async (req, reply) => {
    const { id } = req.params as { id: string }

    const existing = await prisma.buhRecurringPayment.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Recurring payment not found' })

    await prisma.buhRecurringPayment.update({
      where: { id },
      data:  { isActive: false },
    })

    return { ok: true }
  })
}
