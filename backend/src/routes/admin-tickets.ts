import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logger } from '../utils/logger'
import { remnawave } from '../services/remnawave'
import { paymentService } from '../services/payment'

/* ── Schemas ──────────────────────────────────────────────── */

const SendMessageSchema = z.object({
  body:        z.string().min(1).max(5000),
  attachments: z.array(z.object({
    name: z.string(),
    url:  z.string(),
    size: z.number().optional(),
    type: z.string().optional(),
  })).optional(),
  isInternal:  z.boolean().default(false),
})

const UpdateTicketSchema = z.object({
  status:       z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority:     z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  category:     z.enum(['BILLING', 'TECH', 'REFUND', 'SUBSCRIPTION', 'OTHER']).optional(),
  assignedToId: z.string().nullable().optional(),
  subject:      z.string().min(2).max(200).optional(),
})

const CreateTemplateSchema = z.object({
  name:     z.string().min(1).max(100),
  body:     z.string().min(1).max(5000),
  shortcut: z.string().optional().nullable(),
  category: z.enum(['BILLING', 'TECH', 'REFUND', 'SUBSCRIPTION', 'OTHER']).optional().nullable(),
  sortOrder: z.number().optional(),
})

/* ── Admin routes (/api/admin/tickets) ───────────────────── */

export async function adminTicketRoutes(app: FastifyInstance) {
  const staff = { preHandler: [app.requireStaff] }
  const admin = { preHandler: [app.adminOnly] }

  // List all tickets with filters
  app.get('/', staff, async (req) => {
    const q = req.query as {
      status?: string
      priority?: string
      category?: string
      assignedToId?: string
      search?: string
      filter?: 'mine' | 'unassigned' | 'all' | 'urgent'
      page?: string
      limit?: string
    }

    const userId = (req.user as any).sub as string
    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(100, Math.max(10, Number(q.limit) || 30))

    const where: any = {}
    if (q.status) where.status = q.status
    if (q.priority) where.priority = q.priority
    if (q.category) where.category = q.category
    if (q.assignedToId) where.assignedToId = q.assignedToId
    if (q.filter === 'mine') where.assignedToId = userId
    if (q.filter === 'unassigned') where.assignedToId = null
    if (q.filter === 'urgent') where.priority = { in: ['HIGH', 'URGENT'] }
    if (q.search) {
      where.OR = [
        { subject: { contains: q.search, mode: 'insensitive' } },
        { user: { email: { contains: q.search, mode: 'insensitive' } } },
        { user: { telegramName: { contains: q.search, mode: 'insensitive' } } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { lastMessageAt: 'desc' },
        ],
        include: {
          user: {
            select: {
              id: true, email: true, telegramId: true, telegramName: true,
              avatarColor: true, initials: true, subStatus: true, subExpireAt: true,
            },
          },
          assignedTo: { select: { id: true, email: true, telegramName: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            where: { isInternal: false },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ])

    return {
      items: items.map(t => ({
        ...t,
        lastMessage: t.messages[0] || null,
        messages: undefined,
      })),
      total,
      page,
      limit,
    }
  })

  // Stats for dashboard alerts
  app.get('/stats', staff, async () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)

    const [open, pending, urgent, overSla, unassigned] = await Promise.all([
      prisma.ticket.count({ where: { status: 'OPEN' } }),
      prisma.ticket.count({ where: { status: 'PENDING' } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'PENDING'] }, priority: { in: ['HIGH', 'URGENT'] } } }),
      prisma.ticket.count({
        where: {
          status: 'OPEN',
          firstResponseAt: null,
          createdAt: { lt: fifteenMinAgo },
        },
      }),
      prisma.ticket.count({ where: { status: 'OPEN', assignedToId: null } }),
    ])

    return { open, pending, urgent, overSla, unassigned }
  })

  // Get single ticket with full client context
  app.get('/:id', staff, async (req, reply) => {
    const { id } = req.params as { id: string }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true, email: true, telegramId: true, telegramName: true,
            avatarColor: true, initials: true, createdAt: true,
            subStatus: true, subExpireAt: true, subLink: true, remnawaveUuid: true,
            balance: true, bonusDays: true, totalPaid: true, paymentsCount: true,
            lastPaymentAt: true, customerSource: true, customerNotes: true,
            currentPlan: true, referralCode: true, geoInfo: true,
          },
        },
        assignedTo: { select: { id: true, email: true, telegramName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, email: true, telegramName: true, role: true, avatarColor: true } },
          },
        },
      },
    })

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    // Load recent payments and last 5 tariff history
    const [recentPayments, activeTariff] = await Promise.all([
      prisma.payment.findMany({
        where: { userId: ticket.userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { tariff: { select: { name: true } } },
      }),
      ticket.user.currentPlan ? null : null,
    ])

    // Mark messages as read by admin
    await prisma.$transaction([
      prisma.ticketMessage.updateMany({
        where: {
          ticketId: ticket.id,
          authorType: 'USER',
          readByAdminAt: null,
        },
        data: { readByAdminAt: new Date() },
      }),
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { unreadByAdmin: 0 },
      }),
    ])

    return {
      ...ticket,
      context: {
        recentPayments,
      },
    }
  })

  // Send admin message / internal note
  app.post('/:id/messages', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req.user as any).sub as string
    const data = SendMessageSchema.parse(req.body)

    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: data.isInternal ? 'ADMIN' : 'ADMIN',
        authorId: userId,
        body: data.body,
        attachments: data.attachments ? (data.attachments as any) : undefined,
        isInternal: data.isInternal,
        source: 'ADMIN',
      },
    })

    // Update ticket state — only non-internal messages affect it
    if (!data.isInternal) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: ticket.status === 'OPEN' ? 'PENDING' : ticket.status,
          lastMessageAt: new Date(),
          firstResponseAt: ticket.firstResponseAt || new Date(),
          unreadByUser: { increment: 1 },
        },
      })

      // TODO: notify user via TG bot + email
    }

    logger.info(`Admin ${userId} replied on ticket ${ticket.id}${data.isInternal ? ' (internal)' : ''}`)
    return msg
  })

  // Update ticket (status, priority, assignee, etc.)
  app.patch('/:id', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = UpdateTicketSchema.parse(req.body)
    const userId = (req.user as any).sub as string

    const ticket = await prisma.ticket.findUnique({ where: { id } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    const update: any = { ...data }

    if (data.status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
      update.resolvedAt = new Date()
    }
    if (data.status === 'CLOSED' && ticket.status !== 'CLOSED') {
      update.closedAt = new Date()
    }

    // Auto-assign to current admin if taking
    if (data.assignedToId === undefined && !ticket.assignedToId) {
      update.assignedToId = userId
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: update,
    })

    return updated
  })

  // ── Templates ─────────────────────────────────────────────

  app.get('/templates', staff, async () => {
    return prisma.ticketTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  })

  app.post('/templates', admin, async (req) => {
    const data = CreateTemplateSchema.parse(req.body)
    return prisma.ticketTemplate.create({ data: data as any })
  })

  app.patch('/templates/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = CreateTemplateSchema.partial().parse(req.body)
    const existing = await prisma.ticketTemplate.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Template not found' })
    return prisma.ticketTemplate.update({ where: { id }, data: data as any })
  })

  app.delete('/templates/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.ticketTemplate.delete({ where: { id } })
    return { ok: true }
  })

  // ── Quick Actions on Client ─────────────────────────────

  // Helper: add system message to ticket
  async function addSystemMessage(ticketId: string, body: string, adminId: string) {
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorType: 'SYSTEM',
        authorId: adminId,
        body,
        source: 'ADMIN',
        isInternal: false,
      },
    })
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { lastMessageAt: new Date(), unreadByUser: { increment: 1 } },
    })
  }

  // Extend user subscription
  app.post('/:id/actions/extend', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days } = req.body as { days: number }
    const adminId = (req.user as any).sub as string

    if (!days || days < 1 || days > 365) {
      return reply.status(400).send({ error: 'Days must be 1-365' })
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { user: true },
    })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })
    const u = ticket.user

    try {
      // Update REMNAWAVE
      if (u.remnawaveUuid) {
        try {
          const rmUser = await remnawave.getUserByUuid(u.remnawaveUuid)
          const currentExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : new Date()
          const base = currentExpire > new Date() ? currentExpire : new Date()
          base.setDate(base.getDate() + days)
          await remnawave.updateUser({
            uuid: u.remnawaveUuid,
            status: 'ACTIVE',
            expireAt: base.toISOString(),
          })
        } catch (e: any) {
          logger.warn(`REMNAWAVE extend failed: ${e.message}`)
        }
      }

      // Update local DB
      const now = new Date()
      const baseLocal = u.subExpireAt && new Date(u.subExpireAt) > now
        ? new Date(u.subExpireAt)
        : new Date(now)
      baseLocal.setDate(baseLocal.getDate() + days)
      await prisma.user.update({
        where: { id: u.id },
        data: { subStatus: 'ACTIVE', subExpireAt: baseLocal },
      })

      await addSystemMessage(
        ticket.id,
        `✅ Подписка продлена на ${days} дн. Новая дата окончания: ${baseLocal.toLocaleDateString('ru')}`,
        adminId,
      )

      logger.info(`Ticket ${id}: admin ${adminId} extended ${u.id} by ${days} days`)
      return { ok: true, newExpireAt: baseLocal }
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed' })
    }
  })

  // Reset traffic
  app.post('/:id/actions/reset-traffic', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const adminId = (req.user as any).sub as string

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { user: true },
    })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })
    if (!ticket.user.remnawaveUuid) return reply.status(400).send({ error: 'User has no REMNAWAVE subscription' })

    try {
      await remnawave.resetTrafficAction(ticket.user.remnawaveUuid)
      await addSystemMessage(ticket.id, '✅ Трафик сброшен', adminId)
      return { ok: true }
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed' })
    }
  })

  // Grant bonus days
  app.post('/:id/actions/grant-bonus', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days } = req.body as { days: number }
    const adminId = (req.user as any).sub as string

    if (!days || days < 1 || days > 365) {
      return reply.status(400).send({ error: 'Days must be 1-365' })
    }

    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { user: true } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    await prisma.user.update({
      where: { id: ticket.user.id },
      data: { bonusDays: { increment: days } },
    })

    await addSystemMessage(ticket.id, `🎁 Начислено ${days} бонусных дней`, adminId)
    return { ok: true }
  })

  // Add balance
  app.post('/:id/actions/add-balance', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { amount, reason } = req.body as { amount: number; reason?: string }
    const adminId = (req.user as any).sub as string

    if (!amount || amount <= 0 || amount > 100000) {
      return reply.status(400).send({ error: 'Amount must be 1-100000' })
    }

    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { user: true } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    await prisma.$transaction([
      prisma.user.update({
        where: { id: ticket.user.id },
        data: { balance: { increment: amount } },
      }),
      prisma.balanceTransaction.create({
        data: {
          userId: ticket.user.id,
          amount,
          type: 'GIFT',
          description: reason || 'Компенсация от поддержки',
        },
      }),
    ])

    await addSystemMessage(ticket.id, `💰 На баланс зачислено ${amount} ₽${reason ? ` — ${reason}` : ''}`, adminId)
    return { ok: true }
  })

  // Refund last payment
  app.post('/:id/actions/refund', staff, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { amount, paymentId } = req.body as { amount?: number; paymentId?: string }
    const adminId = (req.user as any).sub as string

    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { user: true } })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    // Find payment: specific or last PAID
    const payment = paymentId
      ? await prisma.payment.findUnique({ where: { id: paymentId } })
      : await prisma.payment.findFirst({
          where: { userId: ticket.user.id, status: 'PAID', provider: { in: ['YUKASSA', 'CRYPTOPAY'] } },
          orderBy: { createdAt: 'desc' },
        })

    if (!payment) return reply.status(400).send({ error: 'Нет подходящего платежа для возврата' })
    if (payment.status !== 'PAID') return reply.status(400).send({ error: 'Платёж уже возвращён или не оплачен' })
    if (!payment.yukassaPaymentId) return reply.status(400).send({ error: 'Нет ID платежа ЮKassa' })

    try {
      const gross = payment.amount + Number(payment.commission || 0)
      const refundAmount = amount || gross

      const refund = await paymentService.yukassa.createRefund(payment.yukassaPaymentId, refundAmount)
      const refundAmt = parseFloat(refund.amount.value)
      const isFullRefund = refundAmt >= gross - 0.01

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND',
          refundAmount: refundAmt,
          refundedAt: new Date(),
        },
      })

      await addSystemMessage(
        ticket.id,
        `↩️ Возврат ${refundAmt} ₽ ${isFullRefund ? '(полный)' : '(частичный)'} для платежа ${payment.id.slice(0, 8)}`,
        adminId,
      )

      return { ok: true, refundedAmount: refundAmt, isFullRefund }
    } catch (err: any) {
      const msg = err?.response?.data?.description || err?.message || 'Ошибка возврата'
      return reply.status(400).send({ error: msg })
    }
  })

  // ── Stats / Analytics ────────────────────────────────────
  app.get('/analytics/overview', staff, async (req) => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    const [
      openCount, pendingCount, resolvedCount, closedCount, urgentCount, unassignedCount,
      todayCreated, weekCreated, monthCreated,
      weekResolved, monthResolved,
      byCategory, byAdmin,
      allTickets,
    ] = await Promise.all([
      prisma.ticket.count({ where: { status: 'OPEN' } }),
      prisma.ticket.count({ where: { status: 'PENDING' } }),
      prisma.ticket.count({ where: { status: 'RESOLVED' } }),
      prisma.ticket.count({ where: { status: 'CLOSED' } }),
      prisma.ticket.count({ where: { priority: { in: ['HIGH', 'URGENT'] }, status: { in: ['OPEN', 'PENDING'] } } }),
      prisma.ticket.count({ where: { status: 'OPEN', assignedToId: null } }),
      prisma.ticket.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
      prisma.ticket.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.ticket.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.ticket.count({ where: { resolvedAt: { gte: weekAgo } } }),
      prisma.ticket.count({ where: { resolvedAt: { gte: monthAgo } } }),
      prisma.ticket.groupBy({
        by: ['category'],
        where: { createdAt: { gte: monthAgo } },
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ['assignedToId'],
        where: { resolvedAt: { gte: monthAgo }, assignedToId: { not: null } },
        _count: true,
      }),
      // For avg times
      prisma.ticket.findMany({
        where: { firstResponseAt: { not: null }, createdAt: { gte: monthAgo } },
        select: { createdAt: true, firstResponseAt: true, resolvedAt: true, rating: true },
      }),
    ])

    // Average response time in minutes
    const firstResponseMins = allTickets.length > 0
      ? Math.round(
          allTickets.reduce((s, t) =>
            s + ((t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60000), 0,
          ) / allTickets.length,
        )
      : 0

    const withResolution = allTickets.filter(t => t.resolvedAt)
    const avgResolutionHours = withResolution.length > 0
      ? Math.round(
          withResolution.reduce((s, t) =>
            s + ((t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3600000), 0,
          ) / withResolution.length * 10,
        ) / 10
      : 0

    const withRating = allTickets.filter(t => t.rating)
    const avgRating = withRating.length > 0
      ? Math.round(withRating.reduce((s, t) => s + (t.rating || 0), 0) / withRating.length * 10) / 10
      : null

    // Load admin names
    const adminIds = byAdmin.map(a => a.assignedToId).filter(Boolean) as string[]
    const admins = adminIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true, telegramName: true, avatarColor: true },
        })
      : []
    const adminLoad = byAdmin.map(a => {
      const adm = admins.find(u => u.id === a.assignedToId)
      return {
        adminId: a.assignedToId,
        name: adm?.telegramName || adm?.email || 'unknown',
        avatarColor: adm?.avatarColor || '#534AB7',
        resolvedCount: a._count,
      }
    }).sort((a, b) => b.resolvedCount - a.resolvedCount)

    // Daily series for last 30 days
    const dailyRows = await prisma.$queryRaw<Array<{ day: Date; created: number; resolved: number }>>`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow') as day,
        count(*)::int as created,
        count(resolved_at)::int as resolved
      FROM tickets
      WHERE created_at >= ${monthAgo}
      GROUP BY 1 ORDER BY 1
    `

    return {
      statuses: { open: openCount, pending: pendingCount, resolved: resolvedCount, closed: closedCount },
      urgent: urgentCount,
      unassigned: unassignedCount,
      periodCounts: { today: todayCreated, week: weekCreated, month: monthCreated },
      resolvedCounts: { week: weekResolved, month: monthResolved },
      avgFirstResponseMins: firstResponseMins,
      avgResolutionHours,
      avgRating,
      byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
      adminLoad,
      dailySeries: dailyRows.map(r => ({
        date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
        created: Number(r.created),
        resolved: Number(r.resolved),
      })),
    }
  })

  // ── AI Suggestion (stub) ─────────────────────────────────
  app.post('/:id/ai-suggest', staff, async (req, reply) => {
    const { id } = req.params as { id: string }

    // Check if AI is configured
    const providerSetting = await prisma.setting.findUnique({ where: { key: 'ai_provider' } })
    const tokenSetting = await prisma.setting.findUnique({ where: { key: 'ai_token' } })

    if (!providerSetting || !tokenSetting || !tokenSetting.value) {
      return reply.status(400).send({
        error: 'AI не настроен',
        message: 'Настройте AI-ассистента в настройках: Система → Настройки → AI',
        configured: false,
      })
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: { select: { telegramName: true, currentPlan: true, subStatus: true } },
      },
    })
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

    // TODO: actual AI call (OpenAI / Claude)
    // For now — simple placeholder
    return {
      configured: true,
      suggestion: '[AI-ассистент ещё не реализован. Скоро будет доступен с вашим настроенным API.]',
      provider: providerSetting.value,
    }
  })
}
