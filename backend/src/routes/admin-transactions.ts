import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const TransactionSchema = z.object({
  type:         z.enum(['INCOME', 'EXPENSE']),
  amount:       z.coerce.number(),
  date:         z.string(),
  categoryId:   z.string().optional().nullable(),
  description:  z.string().optional().nullable(),
  receiptUrl:   z.string().optional().nullable(),
  isHistorical: z.boolean().default(false),
})

export async function adminTransactionRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }
  const staff  = { preHandler: [app.requireStaff] }

  // ─────────────────────────────────────────────────────────
  //  LIST TRANSACTIONS
  // ─────────────────────────────────────────────────────────
  app.get('/', staff, async (req) => {
    const q = req.query as {
      type?: string
      category_id?: string
      date_from?: string
      date_to?: string
      search?: string
      skip?: string
      limit?: string
    }

    const where: any = {}

    if (q.type === 'INCOME' || q.type === 'EXPENSE') {
      where.type = q.type
    }
    if (q.category_id) {
      where.categoryId = q.category_id
    }
    if (q.date_from || q.date_to) {
      where.date = {}
      if (q.date_from) where.date.gte = new Date(q.date_from)
      if (q.date_to)   where.date.lte = new Date(q.date_to)
    }
    if (q.search) {
      where.description = { contains: q.search, mode: 'insensitive' }
    }

    const skip  = Math.max(0, Number(q.skip)  || 0)
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50))

    const [items, total] = await Promise.all([
      prisma.buhTransaction.findMany({
        where,
        include: { category: true, createdBy: { select: { id: true, email: true, telegramName: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.buhTransaction.count({ where }),
    ])

    return { items, total, skip, limit }
  })

  // ─────────────────────────────────────────────────────────
  //  CREATE TRANSACTION
  // ─────────────────────────────────────────────────────────
  app.post('/', editor, async (req, reply) => {
    const data = TransactionSchema.parse(req.body)
    const user = (req as any).user

    let categoryId = data.categoryId ?? null

    // Auto-categorize if no category provided
    if (!categoryId && data.description) {
      const rules = await prisma.buhAutoTagRule.findMany({
        select: { keyword: true, categoryId: true },
      })
      const descLower = data.description.toLowerCase()
      const matched = rules.find((r) => descLower.includes(r.keyword.toLowerCase()))
      if (matched) categoryId = matched.categoryId
    }

    const transaction = await prisma.buhTransaction.create({
      data: {
        type:         data.type,
        amount:       data.amount,
        date:         new Date(data.date),
        categoryId,
        description:  data.description ?? null,
        receiptUrl:   data.receiptUrl ?? null,
        isHistorical: data.isHistorical,
        createdById:  user?.sub ?? null,
        source:       'web',
      },
      include: { category: true, createdBy: { select: { id: true, email: true, telegramName: true } } },
    })

    return reply.status(201).send(transaction)
  })

  // ─────────────────────────────────────────────────────────
  //  GET SINGLE TRANSACTION
  // ─────────────────────────────────────────────────────────
  app.get('/:id', staff, async (req, reply) => {
    const { id } = req.params as { id: string }

    const transaction = await prisma.buhTransaction.findUnique({
      where: { id },
      include: { category: true, createdBy: { select: { id: true, email: true, telegramName: true } } },
    })

    if (!transaction) return reply.status(404).send({ error: 'Transaction not found' })
    return transaction
  })

  // ─────────────────────────────────────────────────────────
  //  UPDATE TRANSACTION
  // ─────────────────────────────────────────────────────────
  app.patch('/:id', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = TransactionSchema.partial().parse(req.body)

    const update: any = {}
    if (data.type !== undefined)         update.type         = data.type
    if (data.amount !== undefined)       update.amount       = data.amount
    if (data.date !== undefined)         update.date         = new Date(data.date)
    if (data.categoryId !== undefined)   update.categoryId   = data.categoryId
    if (data.description !== undefined)  update.description  = data.description
    if (data.receiptUrl !== undefined)   update.receiptUrl   = data.receiptUrl
    if (data.isHistorical !== undefined) update.isHistorical = data.isHistorical

    const transaction = await prisma.buhTransaction.update({
      where: { id },
      data: update,
      include: { category: true },
    })

    return transaction
  })

  // ─────────────────────────────────────────────────────────
  //  DELETE TRANSACTION
  // ─────────────────────────────────────────────────────────
  app.delete('/:id', editor, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.buhTransaction.delete({ where: { id } })
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  UPLOAD RECEIPT (via JSON body — actual file upload goes through /api/admin/upload)
  // ─────────────────────────────────────────────────────────
  app.post('/:id/receipt', editor, async (req) => {
    const { id } = req.params as { id: string }
    const { receiptFile } = z.object({ receiptFile: z.string() }).parse(req.body)

    const transaction = await prisma.buhTransaction.update({
      where: { id },
      data: { receiptFile },
      include: { category: true },
    })

    return transaction
  })

  // ─────────────────────────────────────────────────────────
  //  MONTHLY SUMMARY
  // ─────────────────────────────────────────────────────────
  app.get('/summary/by-month', staff, async (req) => {
    const q = req.query as { year?: string }
    const year = Number(q.year) || new Date().getFullYear()

    const rows = await prisma.$queryRaw<
      Array<{ month: number; income: number; expense: number }>
    >`
      SELECT
        EXTRACT(MONTH FROM date)::int AS month,
        COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END), 0)::numeric AS income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0)::numeric AS expense
      FROM buh_transactions
      WHERE EXTRACT(YEAR FROM date) = ${year}
      GROUP BY 1
      ORDER BY 1
    `

    return rows.map((r) => ({
      month:   r.month,
      income:  Number(r.income),
      expense: Number(r.expense),
      profit:  Number(r.income) - Number(r.expense),
    }))
  })
}
