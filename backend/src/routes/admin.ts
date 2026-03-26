import type { FastifyInstance } from 'fastify'
import { z }        from 'zod'
import { prisma }   from '../db'
import { remnawave } from '../services/remnawave'
import { logger }   from '../utils/logger'

const TariffSchema = z.object({
  name:           z.string().min(1),
  description:    z.string().optional(),
  durationDays:   z.number().int().positive(),
  priceRub:       z.number().positive(),
  priceUsdt:      z.number().positive().optional(),
  deviceLimit:    z.number().int().positive().default(3),
  trafficGb:      z.number().int().positive().optional(),
  isFeatured:     z.boolean().default(false),
  sortOrder:      z.number().int().default(0),
  remnawaveTagIds: z.array(z.string()).default([]),
  isActive:       z.boolean().default(true),
})

const InstructionSchema = z.object({
  title:      z.string().min(1),
  deviceType: z.enum(['WINDOWS','MACOS','LINUX','IOS','ANDROID','ROUTER','OTHER']),
  content:    z.string().min(1),
  sortOrder:  z.number().int().default(0),
  isActive:   z.boolean().default(true),
})

export async function adminRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ─────────────────────────────────────────────────────────
  //  DASHBOARD STATS
  // ─────────────────────────────────────────────────────────
  app.get('/stats', admin, async () => {
    const [
      totalUsers, activeUsers, totalRevenue,
      todayRevenue, pendingPayments, rmStats,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subStatus: 'ACTIVE' } }),
      prisma.payment.aggregate({
        where:  { status: 'PAID' },
        _sum:   { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status:      'PAID',
          confirmedAt: { gte: new Date(new Date().setHours(0,0,0,0)) },
        },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      remnawave.getSystemStats().catch(() => null),
    ])

    // Revenue last 30 days by day
    const revChart = await prisma.$queryRaw<Array<{date: string, amount: number}>>`
      SELECT
        DATE_TRUNC('day', "confirmed_at")::date::text AS date,
        SUM(amount) AS amount
      FROM payments
      WHERE status = 'PAID'
        AND confirmed_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `

    return {
      totalUsers,
      activeUsers,
      totalRevenue:   totalRevenue._sum.amount ?? 0,
      todayRevenue:   todayRevenue._sum.amount ?? 0,
      pendingPayments,
      remnawave:      rmStats,
      revenueChart:   revChart,
    }
  })

  // ─────────────────────────────────────────────────────────
  //  TARIFFS
  // ─────────────────────────────────────────────────────────
  app.get('/tariffs', admin, async () =>
    prisma.tariff.findMany({ orderBy: { sortOrder: 'asc' } }),
  )

  app.post('/tariffs', admin, async (req, reply) => {
    const data = TariffSchema.parse(req.body)
    const tariff = await prisma.tariff.create({ data })
    return reply.status(201).send(tariff)
  })

  app.put('/tariffs/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data   = TariffSchema.partial().parse(req.body)
    const tariff = await prisma.tariff.update({ where: { id }, data })
    return tariff
  })

  app.delete('/tariffs/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.tariff.update({ where: { id }, data: { isActive: false } })
    return reply.status(204).send()
  })

  // ─────────────────────────────────────────────────────────
  //  INSTRUCTIONS
  // ─────────────────────────────────────────────────────────
  app.get('/instructions', admin, async () =>
    prisma.instruction.findMany({ orderBy: { sortOrder: 'asc' } }),
  )

  app.post('/instructions', admin, async (req, reply) => {
    const data = InstructionSchema.parse(req.body)
    const ins  = await prisma.instruction.create({ data })
    return reply.status(201).send(ins)
  })

  app.put('/instructions/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    const data   = InstructionSchema.partial().parse(req.body)
    return prisma.instruction.update({ where: { id }, data })
  })

  app.delete('/instructions/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.instruction.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ─────────────────────────────────────────────────────────
  //  USERS
  // ─────────────────────────────────────────────────────────
  app.get('/users', admin, async (req) => {
    const { page = '1', limit = '50', search = '', status = '' } =
      req.query as Record<string, string>

    const skip = (Number(page) - 1) * Number(limit)
    const where: any = {}
    if (search) {
      where.OR = [
        { email:        { contains: search, mode: 'insensitive' } },
        { telegramName: { contains: search, mode: 'insensitive' } },
        { telegramId:   { contains: search } },
      ]
    }
    if (status) where.subStatus = status

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take:    Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, telegramId: true, telegramName: true,
          subStatus: true, subExpireAt: true, role: true, isActive: true,
          createdAt: true, lastLoginAt: true, remnawaveUuid: true,
          referralCode: true, _count: { select: { referrals: true, payments: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return { users, total, page: Number(page), limit: Number(limit) }
  })

  app.get('/users/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({
      where:   { id },
      include: {
        payments:     { orderBy: { createdAt: 'desc' }, take: 20 },
        bonusHistory: { orderBy: { appliedAt: 'desc' } },
        referrals:    { select: { id: true, email: true, telegramName: true } },
      },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const { passwordHash, ...safe } = user as any
    return safe
  })

  // Extend user subscription manually
  app.post('/users/:id/extend', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days, note } = req.body as { days: number; note?: string }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user?.remnawaveUuid) {
      return reply.status(400).send({ error: 'User has no REMNAWAVE subscription' })
    }

    const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
    const updated = await remnawave.extendSubscription(
      user.remnawaveUuid, days,
      rmUser.expireAt ? new Date(rmUser.expireAt) : null,
    )

    await prisma.user.update({
      where: { id },
      data: {
        subExpireAt: updated.expireAt ? new Date(updated.expireAt) : null,
        subStatus:   'ACTIVE',
      },
    })

    // Log manual payment
    await prisma.payment.create({
      data: {
        userId:   id,
        tariffId: (await prisma.tariff.findFirst({ orderBy: { createdAt: 'asc' } }))!.id,
        provider: 'MANUAL',
        amount:   0,
        currency: 'RUB',
        status:   'PAID',
        confirmedAt: new Date(),
      },
    })

    logger.info(`Admin extended ${id} by ${days} days. Note: ${note}`)
    return { ok: true, newExpireAt: updated.expireAt }
  })

  // Toggle user active status
  app.post('/users/:id/toggle', admin, async (req) => {
    const { id }     = req.params as { id: string }
    const user       = await prisma.user.findUniqueOrThrow({ where: { id } })
    const newActive  = !user.isActive

    await prisma.user.update({ where: { id }, data: { isActive: newActive } })

    if (user.remnawaveUuid) {
      newActive
        ? await remnawave.enableUser(user.remnawaveUuid)
        : await remnawave.disableUser(user.remnawaveUuid)
    }

    return { ok: true, isActive: newActive }
  })

  // ─────────────────────────────────────────────────────────
  //  PAYMENTS
  // ─────────────────────────────────────────────────────────
  app.get('/payments', admin, async (req) => {
    const { page = '1', limit = '50', status = '', provider = '' } =
      req.query as Record<string, string>

    const skip  = (Number(page) - 1) * Number(limit)
    const where: any = {}
    if (status)   where.status   = status
    if (provider) where.provider = provider

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take:    Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user:   { select: { email: true, telegramName: true, telegramId: true } },
          tariff: { select: { name: true } },
        },
      }),
      prisma.payment.count({ where }),
    ])

    return { payments, total }
  })

  // ─────────────────────────────────────────────────────────
  //  SETTINGS
  // ─────────────────────────────────────────────────────────
  app.get('/settings', admin, async () => {
    const settings = await prisma.setting.findMany()
    return Object.fromEntries(settings.map(s => [s.key, s.value]))
  })

  app.put('/settings', admin, async (req) => {
    const updates = req.body as Record<string, string>
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.setting.upsert({
          where:  { key },
          create: { key, value },
          update: { value },
        }),
      ),
    )
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  IMPORT STATUS
  // ─────────────────────────────────────────────────────────
  app.get('/import', admin, async () => {
    const [total, matched, pending] = await Promise.all([
      prisma.importRecord.count(),
      prisma.importRecord.count({ where: { status: 'matched' } }),
      prisma.importRecord.count({ where: { status: 'pending' } }),
    ])
    return { total, matched, pending, unmatched: total - matched }
  })
}
