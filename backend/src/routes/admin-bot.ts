import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { bot } from '../bot'
import { logger } from '../utils/logger'

export async function adminBotRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── GET /chats — list users who chatted with bot ────────────────
  app.get('/chats', admin, async (req) => {
    const qs = z
      .object({
        search: z.string().optional(),
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query)

    const { search, page, limit } = qs
    const offset = (page - 1) * limit

    // Build user-level WHERE for search
    const userWhere: any = {}
    if (search) {
      userWhere.OR = [
        { telegramName: { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
        { telegramId:   { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get distinct userIds from bot_messages that have a userId
    const grouped = await prisma.botMessage.groupBy({
      by:       ['userId'],
      where:    { userId: { not: null }, user: userWhere },
      _count:   { id: true },
      _max:     { createdAt: true },
      orderBy:  { _max: { createdAt: 'desc' } },
      skip:     offset,
      take:     limit,
    })

    // Total unique users
    const totalAgg = await prisma.botMessage.groupBy({
      by:    ['userId'],
      where: { userId: { not: null }, user: userWhere },
    })
    const total = totalAgg.length

    // Fetch user info + last message text for each
    const chats = await Promise.all(
      grouped.map(async (g) => {
        const userId = g.userId!

        const [user, lastMsg] = await Promise.all([
          prisma.user.findUnique({
            where:  { id: userId },
            select: {
              id: true, email: true, telegramId: true, telegramName: true,
              subStatus: true, balance: true, bonusDays: true, createdAt: true, role: true,
            },
          }),
          prisma.botMessage.findFirst({
            where:   { userId },
            orderBy: { createdAt: 'desc' },
            select:  { text: true, createdAt: true },
          }),
        ])

        return {
          user: user ? { ...user, balance: Number(user.balance) } : null,
          lastMessage:    lastMsg?.text ?? '',
          lastDate:       (lastMsg?.createdAt ?? g._max.createdAt)?.toISOString() ?? null,
          messageCount:   g._count.id,
        }
      }),
    )

    return { chats, total, page, limit }
  })

  // ── GET /chats/:userId/messages — chat history for user ─────────
  app.get('/chats/:userId/messages', admin, async (req) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.params)
    const qs = z
      .object({
        page:  z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query)

    const { page, limit } = qs
    const offset = (page - 1) * limit

    const total = await prisma.botMessage.count({ where: { userId } })

    // Get latest messages: skip from the end, sort asc for display
    const skipFromEnd = Math.max(0, total - page * limit)
    const takeCount = page === 1 ? Math.min(limit, total) : limit

    const messages = await prisma.botMessage.findMany({
      where:   { userId },
      orderBy: { createdAt: 'asc' },
      skip:    Math.max(0, skipFromEnd),
      take:    takeCount,
    })

    return { messages, total, page, limit }
  })

  // ── POST /chats/:userId/send — admin sends message to user ──────
  app.post('/chats/:userId/send', admin, async (req, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.params)
    const { text }   = z.object({ text: z.string().min(1) }).parse(req.body)

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { telegramId: true },
    })
    if (!user?.telegramId) {
      return reply.status(404).send({ error: 'User not found or no telegramId' })
    }

    try {
      await bot.api.sendMessage(user.telegramId, text)
    } catch (err) {
      logger.error(`Failed to send bot message to user ${userId} (tg: ${user.telegramId}): ${err}`)
      return reply.status(502).send({ error: 'Failed to send message via Telegram' })
    }

    // Note: outgoing message is logged by API transformer in bot/index.ts
    return { ok: true }
  })

  // ── POST /chats/:userId/send-block — send bot block to user ─────
  app.post('/chats/:userId/send-block', admin, async (req, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.params)
    const { blockId } = z.object({ blockId: z.string() }).parse(req.body)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    })
    if (!user?.telegramId) {
      return reply.status(404).send({ error: 'User not found' })
    }

    try {
      const { executeBlock } = await import('../bot/engine')
      await executeBlock(blockId, null, userId, user.telegramId)
      return { ok: true }
    } catch (err: any) {
      logger.error(`Failed to send block ${blockId} to user ${userId}: ${err.message}`)
      return reply.status(500).send({ error: 'Failed to send block' })
    }
  })

  // ── GET /blocks-for-picker — groups with blocks for picker ─────
  app.get('/blocks-for-picker', admin, async () => {
    const groups = await prisma.botBlockGroup.findMany({
      include: {
        blocks: {
          select: { id: true, name: true, type: true, text: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return groups
  })

  // ── GET /settings — bot settings ────────────────────────────────
  app.get('/settings', admin, async () => {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'bot_' } },
    })

    const result: Record<string, string> = {}
    for (const r of rows) result[r.key] = r.value

    return result
  })

  // ── PUT /settings — update bot settings ─────────────────────────
  app.put('/settings', admin, async (req) => {
    const body = z.record(z.string(), z.string()).parse(req.body)

    await Promise.all(
      Object.entries(body).map(([key, value]) =>
        prisma.setting.upsert({
          where:  { key },
          create: { key, value },
          update: { value },
        }),
      ),
    )

    return { ok: true }
  })
}
