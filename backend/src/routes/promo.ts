import type { FastifyInstance } from 'fastify'
import { z }      from 'zod'
import { prisma } from '../db'

// ── Admin CRUD ──────────────────────────────────────────────
export async function adminPromoRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // List all promos
  app.get('/', admin, async () => {
    return prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { usages: true } } },
    })
  })

  // Create promo
  app.post('/', admin, async (req, reply) => {
    const schema = z.object({
      code:          z.string().min(1).transform(v => v.toUpperCase()),
      type:          z.enum(['bonus_days', 'discount', 'balance', 'trial']).default('bonus_days'),
      bonusDays:     z.coerce.number().int().positive().optional().nullable(),
      discountPct:   z.coerce.number().int().min(1).max(100).optional().nullable(),
      tariffIds:     z.array(z.string()).default([]),
      balanceAmount: z.coerce.number().positive().optional().nullable(),
      maxUses:       z.coerce.number().int().positive().optional().nullable(),
      maxUsesPerUser: z.coerce.number().int().positive().default(1),
      expiresAt:     z.string().optional().nullable(),
      isActive:      z.coerce.boolean().default(true),
      description:   z.string().optional().nullable(),
    })
    const data = schema.parse(req.body)

    const existing = await prisma.promoCode.findUnique({ where: { code: data.code } })
    if (existing) return reply.status(400).send({ error: 'Промокод уже существует' })

    const promo = await prisma.promoCode.create({
      data: {
        ...data,
        bonusDays: data.bonusDays || null,
        discountPct: data.discountPct || null,
        balanceAmount: data.balanceAmount || null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    })
    return promo
  })

  // Update promo
  app.put('/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const schema = z.object({
      code:          z.string().min(1).transform(v => v.toUpperCase()).optional(),
      type:          z.enum(['bonus_days', 'discount', 'balance', 'trial']).optional(),
      bonusDays:     z.coerce.number().int().positive().optional().nullable(),
      discountPct:   z.coerce.number().int().min(1).max(100).optional().nullable(),
      tariffIds:     z.array(z.string()).optional(),
      balanceAmount: z.coerce.number().positive().optional().nullable(),
      maxUses:       z.coerce.number().int().positive().optional().nullable(),
      maxUsesPerUser: z.coerce.number().int().positive().optional(),
      expiresAt:     z.string().optional().nullable(),
      isActive:      z.coerce.boolean().optional(),
      description:   z.string().optional().nullable(),
    })
    const data = schema.parse(req.body)

    const promo = await prisma.promoCode.update({
      where: { id },
      data: {
        ...data,
        expiresAt: data.expiresAt !== undefined
          ? (data.expiresAt ? new Date(data.expiresAt) : null)
          : undefined,
      },
    })
    return promo
  })

  // Promo stats — who activated, who used discount
  app.get('/:id/stats', admin, async (req) => {
    const { id } = req.params as { id: string }
    const promo = await prisma.promoCode.findUnique({
      where: { id },
      include: {
        usages: {
          include: {
            user: { select: { id: true, email: true, telegramName: true, telegramId: true } },
          },
          orderBy: { usedAt: 'desc' },
        },
      },
    })
    if (!promo) return { error: 'Not found' }

    // For discount promos — check if users who activated actually paid
    let usageDetails = promo.usages.map(u => ({
      userId: u.user.id,
      name: u.user.telegramName || u.user.email || u.user.telegramId || u.userId.slice(0, 8),
      activatedAt: u.usedAt,
      usedForPurchase: false as boolean,
    }))

    if (promo.type === 'discount') {
      // Check payments after activation for each user
      for (const usage of usageDetails) {
        const payment = await prisma.payment.findFirst({
          where: {
            userId: usage.userId,
            status: 'PAID',
            confirmedAt: { gte: usage.activatedAt },
          },
        })
        usage.usedForPurchase = !!payment
      }
    }

    return {
      promo: { id: promo.id, code: promo.code, type: promo.type, usedCount: promo.usedCount, maxUses: promo.maxUses },
      usages: usageDetails,
      totalActivated: usageDetails.length,
      totalUsedForPurchase: usageDetails.filter(u => u.usedForPurchase).length,
    }
  })

  // Delete promo
  app.delete('/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.promoCode.delete({ where: { id } })
    return { ok: true }
  })
}

// ── User endpoints ──────────────────────────────────────────
export async function userPromoRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // Get active discount for user
  app.get('/active-discount', auth, async (req) => {
    const userId = (req.user as any).sub
    const usage = await prisma.promoUsage.findFirst({
      where: { userId, promo: { type: 'discount', isActive: true } },
      include: { promo: true },
      orderBy: { usedAt: 'desc' },
    })
    if (!usage) return { active: false }
    return {
      active: true,
      code: usage.promo.code,
      discountPct: usage.promo.discountPct,
      tariffIds: usage.promo.tariffIds,
      description: usage.promo.description,
    }
  })

  // Check promo code validity
  app.post('/check', auth, async (req, reply) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body)
    const userId = (req.user as any).sub

    const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } })
    if (!promo || !promo.isActive) return reply.status(404).send({ error: 'Промокод не найден' })
    if (promo.expiresAt && promo.expiresAt < new Date()) return reply.status(400).send({ error: 'Промокод истёк' })
    if (promo.maxUses && promo.usedCount >= promo.maxUses) return reply.status(400).send({ error: 'Промокод исчерпан' })

    const used = await prisma.promoUsage.findUnique({
      where: { promoId_userId: { promoId: promo.id, userId } },
    })
    if (used) return reply.status(400).send({ error: 'Вы уже использовали этот промокод' })

    return {
      valid: true,
      type: promo.type,
      description: promo.description,
      bonusDays: promo.bonusDays,
      discountPct: promo.discountPct,
      balanceAmount: promo.balanceAmount,
      tariffIds: promo.tariffIds,
    }
  })

  // Activate promo code
  app.post('/activate', auth, async (req, reply) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body)
    const userId = (req.user as any).sub

    const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } })
    if (!promo || !promo.isActive) return reply.status(404).send({ error: 'Промокод не найден' })
    if (promo.expiresAt && promo.expiresAt < new Date()) return reply.status(400).send({ error: 'Промокод истёк' })
    if (promo.maxUses && promo.usedCount >= promo.maxUses) return reply.status(400).send({ error: 'Промокод исчерпан' })

    const used = await prisma.promoUsage.findUnique({
      where: { promoId_userId: { promoId: promo.id, userId } },
    })
    if (used) return reply.status(400).send({ error: 'Вы уже использовали этот промокод' })

    // Apply promo effect
    let message = 'Промокод активирован'

    if (promo.type === 'bonus_days' && promo.bonusDays) {
      await prisma.user.update({
        where: { id: userId },
        data: { bonusDays: { increment: promo.bonusDays } },
      })
      message = `Вам начислено +${promo.bonusDays} бонусных дней`
    }

    if (promo.type === 'balance' && promo.balanceAmount) {
      const { balanceService } = await import('../services/balance')
      await balanceService.credit({
        userId,
        amount: promo.balanceAmount,
        type: 'TOPUP',
        description: `Промокод ${promo.code}`,
      })
      message = `На баланс зачислено ${promo.balanceAmount} руб.`
    }

    if (promo.type === 'discount') {
      message = `Скидка ${promo.discountPct}% будет применена при оплате`
    }

    if (promo.type === 'trial') {
      message = 'Пробный период активирован'
    }

    // Record usage and increment counter
    await prisma.promoUsage.create({ data: { promoId: promo.id, userId } })
    await prisma.promoCode.update({
      where: { id: promo.id },
      data: { usedCount: { increment: 1 } },
    })

    return { ok: true, message, type: promo.type }
  })
}
