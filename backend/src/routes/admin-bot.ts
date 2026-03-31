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
    const items = await Promise.all(
      grouped.map(async (g) => {
        const userId = g.userId!

        const [user, lastMsg] = await Promise.all([
          prisma.user.findUnique({
            where:  { id: userId },
            select: { id: true, email: true, telegramId: true, telegramName: true },
          }),
          prisma.botMessage.findFirst({
            where:   { userId },
            orderBy: { createdAt: 'desc' },
            select:  { text: true, createdAt: true },
          }),
        ])

        return {
          user,
          lastMessageText: lastMsg?.text ?? null,
          lastMessageDate: lastMsg?.createdAt ?? g._max.createdAt,
          messageCount:    g._count.id,
        }
      }),
    )

    return { items, total, page, limit }
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

    const [messages, total] = await Promise.all([
      prisma.botMessage.findMany({
        where:   { userId },
        orderBy: { createdAt: 'asc' },
        skip:    offset,
        take:    limit,
      }),
      prisma.botMessage.count({ where: { userId } }),
    ])

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
      logger.error({ err, userId, telegramId: user.telegramId }, 'Failed to send bot message')
      return reply.status(502).send({ error: 'Failed to send message via Telegram' })
    }

    await prisma.botMessage.create({
      data: {
        chatId:    user.telegramId,
        userId,
        direction: 'OUT',
        text,
      },
    })

    return { ok: true }
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
