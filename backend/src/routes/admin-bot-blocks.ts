import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import Redis from 'ioredis'
import { prisma } from '../db'
import { config } from '../config'

const BotBlockTypeEnum = z.enum([
  'MESSAGE', 'CONDITION', 'ACTION', 'INPUT', 'DELAY', 'SPLIT',
  'REDIRECT', 'PAYMENT', 'MEDIA_GROUP', 'EFFECT', 'REACTION',
  'STREAMING', 'GIFT', 'HTTP', 'EMAIL', 'NOTIFY_ADMIN', 'ASSIGN', 'FUNNEL',
  'TARIFF_LIST', 'PAYMENT_SUCCESS', 'PAYMENT_FAIL', 'PROMO_ACTIVATE',
])

export async function adminBotBlockRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── POST /reseed-templates — re-apply the bundled bot/funnel templates ─
  // Idempotent thanks to ON CONFLICT DO NOTHING in the seed SQL. Safe to hit
  // after a partially-successful first boot (admin canvas looks empty).
  app.post('/reseed-templates', admin, async () => {
    const { reseedBotTemplates } = await import('../services/bot-templates-seed')
    const { seedRetentionFunnel } = await import('../services/retention-funnel-seed')
    const tplResult = await reseedBotTemplates()
    let retentionStatus: 'created' | 'already-exists' | 'error' = 'already-exists'
    try {
      const before = await prisma.funnel.count({ where: { name: 'Ретаргет — подписка закончилась' } })
      await seedRetentionFunnel()
      const after = await prisma.funnel.count({ where: { name: 'Ретаргет — подписка закончилась' } })
      retentionStatus = after > before ? 'created' : 'already-exists'
    } catch {
      retentionStatus = 'error'
    }
    return { templates: tplResult, retention: retentionStatus }
  })

  // ═══════════════════════════════════════════════════════════════
  // GROUPS
  // ═══════════════════════════════════════════════════════════════

  // ── GET /groups — list all groups with block count ─────────────
  app.get('/groups', admin, async () => {
    const groups = await prisma.botBlockGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { blocks: true } } },
    })
    return groups.map((g) => ({
      ...g,
      blockCount: g._count.blocks,
      _count: undefined,
    }))
  })

  // ── POST /groups — create group ───────────────────────────────
  app.post('/groups', admin, async (req) => {
    const body = z
      .object({
        name:      z.string().min(1).max(100),
        icon:      z.string().max(50).optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body)

    return prisma.botBlockGroup.create({ data: body })
  })

  // ── PUT /groups/:id — update group ────────────────────────────
  app.put<{ Params: { id: string } }>('/groups/:id', admin, async (req) => {
    const { id } = req.params
    const body = z
      .object({
        name:      z.string().min(1).max(100).optional(),
        icon:      z.string().max(50).nullish(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body)

    return prisma.botBlockGroup.update({ where: { id }, data: body })
  })

  // ── DELETE /groups/:id — delete group (blocks become ungrouped)
  app.delete<{ Params: { id: string } }>('/groups/:id', admin, async (req) => {
    const { id } = req.params

    await prisma.botBlock.updateMany({
      where: { groupId: id },
      data:  { groupId: null },
    })

    await prisma.botBlockGroup.delete({ where: { id } })
    return { ok: true }
  })

  // ── PUT /groups/reorder — update sortOrder by array position ──
  app.put('/groups/reorder', admin, async (req) => {
    const { ids } = z
      .object({ ids: z.array(z.string().uuid()) })
      .parse(req.body)

    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.botBlockGroup.update({ where: { id }, data: { sortOrder: i } }),
      ),
    )
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════════
  // BLOCKS
  // ═══════════════════════════════════════════════════════════════

  // ── GET /blocks — list blocks with filters ────────────────────
  app.get('/blocks', admin, async (req) => {
    const qs = z
      .object({
        groupId: z.string().uuid().optional(),
        type:    BotBlockTypeEnum.optional(),
      })
      .parse(req.query)

    const where: any = {}
    if (qs.groupId) where.groupId = qs.groupId
    if (qs.type)    where.type = qs.type

    const blocks = await prisma.botBlock.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { buttons: true, triggers: true } },
        group:  { select: { id: true, name: true, icon: true } },
        buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }, { sortOrder: 'asc' }] },
      },
    })

    return blocks.map((b) => ({
      ...b,
      buttonsCount:  b._count.buttons,
      triggersCount: b._count.triggers,
      _count: undefined,
    }))
  })

  // ── GET /blocks/:id — single block with relations + stats ─────
  app.get<{ Params: { id: string } }>('/blocks/:id', admin, async (req) => {
    const { id } = req.params

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const block = await prisma.botBlock.findUniqueOrThrow({
      where: { id },
      include: {
        group:   true,
        buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }, { sortOrder: 'asc' }] },
        triggers: true,
        stats: {
          where:   { date: { gte: thirtyDaysAgo } },
          orderBy: { date: 'asc' },
        },
      },
    })

    return block
  })

  // ── POST /blocks — create block ───────────────────────────────
  app.post('/blocks', admin, async (req) => {
    const body = z
      .object({
        name:             z.string().min(1).max(200),
        groupId:          z.string().uuid().nullish(),
        type:             BotBlockTypeEnum,
        text:             z.string().nullish(),
        mediaUrl:         z.string().nullish(),
        mediaType:        z.string().nullish(),
        parseMode:        z.string().default('Markdown'),
        pinMessage:       z.boolean().default(false),
        deletePrev:       z.string().default('none'),
        replyKeyboard:    z.any().optional(),
        removeReplyKb:    z.boolean().default(false),
        conditionType:    z.string().nullish(),
        conditionValue:   z.string().nullish(),
        conditionLogic:   z.string().default('AND'),
        conditions:       z.any().optional(),
        nextBlockTrue:    z.string().nullish(),
        nextBlockFalse:   z.string().nullish(),
        actionType:       z.string().nullish(),
        actionValue:      z.string().nullish(),
        nextBlockId:      z.string().nullish(),
        inputPrompt:      z.string().nullish(),
        inputVar:         z.string().nullish(),
        inputValidation:  z.string().nullish(),
        delayMinutes:     z.number().int().nullish(),
        delayUnit:        z.string().default('minutes'),
        splitVariants:    z.any().optional(),
        redirectBlockId:  z.string().nullish(),
        reactionEmoji:    z.string().nullish(),
        notifyAdminText:  z.string().nullish(),
        httpMethod:       z.string().nullish(),
        httpUrl:          z.string().nullish(),
        httpHeaders:      z.any().optional(),
        httpBody:         z.string().nullish(),
        httpSaveVar:      z.string().nullish(),
        emailSubject:     z.string().nullish(),
        emailBody:        z.string().nullish(),
        paymentTitle:       z.string().nullish(),
        paymentDescription: z.string().nullish(),
        paymentAmount:      z.number().int().nullish(),
        paymentPayload:     z.string().nullish(),
        messageEffectId:  z.string().nullish(),
        streamingText:    z.string().nullish(),
        giftId:           z.string().nullish(),
        funnelId:         z.string().nullish(),
        throttleMinutes:  z.number().int().nullish(),
        scheduleStart:    z.string().nullish(),
        scheduleEnd:      z.string().nullish(),
        scheduleDays:     z.any().optional(),
        scheduleBlockId:  z.string().nullish(),
        customMessages:   z.record(z.string(), z.string()).nullish(),
        posX:             z.number().default(0),
        posY:             z.number().default(0),
        isDraft:          z.boolean().default(true),
        sortOrder:        z.number().int().default(0),
      })
      .parse(req.body)

    return prisma.botBlock.create({ data: body })
  })

  // ── PUT /blocks/:id — update block ────────────────────────────
  app.put<{ Params: { id: string } }>('/blocks/:id', admin, async (req) => {
    const { id } = req.params
    const body = z
      .object({
        name:             z.string().min(1).max(200).optional(),
        groupId:          z.string().uuid().nullish(),
        type:             BotBlockTypeEnum.optional(),
        text:             z.string().nullish(),
        mediaUrl:         z.string().nullish(),
        mediaType:        z.string().nullish(),
        parseMode:        z.string().optional(),
        pinMessage:       z.boolean().optional(),
        deletePrev:       z.string().optional(),
        replyKeyboard:    z.any().optional(),
        removeReplyKb:    z.boolean().optional(),
        conditionType:    z.string().nullish(),
        conditionValue:   z.string().nullish(),
        conditionLogic:   z.string().optional(),
        conditions:       z.any().optional(),
        nextBlockTrue:    z.string().nullish(),
        nextBlockFalse:   z.string().nullish(),
        actionType:       z.string().nullish(),
        actionValue:      z.string().nullish(),
        nextBlockId:      z.string().nullish(),
        inputPrompt:      z.string().nullish(),
        inputVar:         z.string().nullish(),
        inputValidation:  z.string().nullish(),
        delayMinutes:     z.number().int().nullish(),
        delayUnit:        z.string().optional(),
        splitVariants:    z.any().optional(),
        redirectBlockId:  z.string().nullish(),
        reactionEmoji:    z.string().nullish(),
        notifyAdminText:  z.string().nullish(),
        httpMethod:       z.string().nullish(),
        httpUrl:          z.string().nullish(),
        httpHeaders:      z.any().optional(),
        httpBody:         z.string().nullish(),
        httpSaveVar:      z.string().nullish(),
        emailSubject:     z.string().nullish(),
        emailBody:        z.string().nullish(),
        paymentTitle:       z.string().nullish(),
        paymentDescription: z.string().nullish(),
        paymentAmount:      z.number().int().nullish(),
        paymentPayload:     z.string().nullish(),
        messageEffectId:  z.string().nullish(),
        streamingText:    z.string().nullish(),
        giftId:           z.string().nullish(),
        funnelId:         z.string().nullish(),
        throttleMinutes:  z.number().int().nullish(),
        scheduleStart:    z.string().nullish(),
        scheduleEnd:      z.string().nullish(),
        scheduleDays:     z.any().optional(),
        scheduleBlockId:  z.string().nullish(),
        customMessages:   z.record(z.string(), z.string()).nullish(),
        posX:             z.number().optional(),
        posY:             z.number().optional(),
        isDraft:          z.boolean().optional(),
        sortOrder:        z.number().int().optional(),
      })
      .parse(req.body)

    return prisma.botBlock.update({ where: { id }, data: body })
  })

  // ── PUT /blocks/:id/publish — publish block ───────────────────
  app.put<{ Params: { id: string } }>('/blocks/:id/publish', admin, async (req) => {
    const { id } = req.params

    const block = await prisma.botBlock.update({
      where: { id },
      data: {
        isDraft:     false,
        version:     { increment: 1 },
        publishedAt: new Date(),
      },
    })

    try {
      const { invalidateBlockCache } = await import('../bot/engine')
      invalidateBlockCache()
    } catch {
      // engine module not yet available
    }

    // Notify bot container(s) via Redis pub/sub
    try {
      const pub = new Redis(config.redis.url)
      await pub.publish('bot:cache:invalidate', JSON.stringify({ blockId: id, ts: Date.now() }))
      await pub.quit()
    } catch {
      // Redis publish failed — bot will reload on next TTL expiry
    }

    return block
  })

  // ── DELETE /blocks/:id — cascade delete ───────────────────────
  app.delete<{ Params: { id: string } }>('/blocks/:id', admin, async (req) => {
    const { id } = req.params
    await prisma.botBlock.delete({ where: { id } })
    return { ok: true }
  })

  // ── PUT /blocks/reorder — update sortOrder by array position ──
  app.put('/blocks/reorder', admin, async (req) => {
    const { ids } = z
      .object({ ids: z.array(z.string().uuid()) })
      .parse(req.body)

    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.botBlock.update({ where: { id }, data: { sortOrder: i } }),
      ),
    )
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════════
  // BLOCKS LIGHTWEIGHT LIST (for dropdowns)
  // ═══════════════════════════════════════════════════════════════

  // ── GET /blocks-list — lightweight block list ─────────────────
  app.get('/blocks-list', admin, async () => {
    return prisma.botBlock.findMany({
      select:  { id: true, name: true, type: true, groupId: true },
      orderBy: { name: 'asc' },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // BUTTONS
  // ═══════════════════════════════════════════════════════════════

  // ── POST /blocks/:blockId/buttons — create button ─────────────
  app.post<{ Params: { blockId: string } }>('/blocks/:blockId/buttons', admin, async (req) => {
    const { blockId } = req.params
    const body = z
      .object({
        label:            z.string().min(1).max(200),
        type:             z.string().default('block'),
        nextBlockId:      z.string().uuid().nullish(),
        url:              z.string().nullish(),
        copyText:         z.string().nullish(),
        style:            z.string().nullish(),
        iconCustomEmojiId: z.string().nullish(),
        row:              z.number().int().default(0),
        col:              z.number().int().default(0),
      })
      .parse(req.body)

    // Verify block exists
    await prisma.botBlock.findUniqueOrThrow({ where: { id: blockId } })

    return prisma.botButton.create({
      data: { ...body, blockId },
    })
  })

  // ── PUT /buttons/:id — update button ──────────────────────────
  app.put<{ Params: { id: string } }>('/buttons/:id', admin, async (req) => {
    const { id } = req.params
    const body = z
      .object({
        label:            z.string().min(1).max(200).optional(),
        type:             z.string().optional(),
        nextBlockId:      z.string().uuid().nullish(),
        url:              z.string().nullish(),
        copyText:         z.string().nullish(),
        style:            z.string().nullish(),
        iconCustomEmojiId: z.string().nullish(),
        row:              z.number().int().optional(),
        col:              z.number().int().optional(),
      })
      .parse(req.body)

    return prisma.botButton.update({ where: { id }, data: body })
  })

  // ── DELETE /buttons/:id — delete button ───────────────────────
  app.delete<{ Params: { id: string } }>('/buttons/:id', admin, async (req) => {
    const { id } = req.params
    await prisma.botButton.delete({ where: { id } })
    return { ok: true }
  })

  // ── PUT /blocks/:blockId/buttons/reorder — reorder buttons ────
  app.put<{ Params: { blockId: string } }>('/blocks/:blockId/buttons/reorder', admin, async (req) => {
    const { blockId } = req.params
    const { buttons } = z
      .object({
        buttons: z.array(
          z.object({
            id:        z.string().uuid(),
            row:       z.number().int(),
            col:       z.number().int(),
            sortOrder: z.number().int(),
          }),
        ),
      })
      .parse(req.body)

    await prisma.$transaction(
      buttons.map((b) =>
        prisma.botButton.update({
          where: { id: b.id },
          data:  { row: b.row, col: b.col, sortOrder: b.sortOrder },
        }),
      ),
    )
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════════
  // TRIGGERS
  // ═══════════════════════════════════════════════════════════════

  // ── GET /triggers — list all triggers with block name ─────────
  app.get('/triggers', admin, async () => {
    return prisma.botTrigger.findMany({
      orderBy: { priority: 'desc' },
      include: { block: { select: { id: true, name: true, type: true } } },
    })
  })

  // ── POST /triggers — create trigger ───────────────────────────
  app.post('/triggers', admin, async (req, reply) => {
    const body = z
      .object({
        type:     z.string().min(1),
        value:    z.string().min(1),
        blockId:  z.string().uuid(),
        priority: z.number().int().default(0),
      })
      .parse(req.body)

    // Validate uniqueness of type+value
    const existing = await prisma.botTrigger.findUnique({
      where: { type_value: { type: body.type, value: body.value } },
    })
    if (existing) {
      return reply.status(409).send({
        error: `Trigger with type="${body.type}" and value="${body.value}" already exists`,
      })
    }

    return prisma.botTrigger.create({ data: body })
  })

  // ── PUT /triggers/:id — update trigger ────────────────────────
  app.put<{ Params: { id: string } }>('/triggers/:id', admin, async (req, reply) => {
    const { id } = req.params
    const body = z
      .object({
        type:     z.string().min(1).optional(),
        value:    z.string().min(1).optional(),
        blockId:  z.string().uuid().optional(),
        priority: z.number().int().optional(),
      })
      .parse(req.body)

    // If type or value is being changed, check uniqueness
    if (body.type || body.value) {
      const current = await prisma.botTrigger.findUniqueOrThrow({ where: { id } })
      const newType  = body.type  ?? current.type
      const newValue = body.value ?? current.value

      const existing = await prisma.botTrigger.findUnique({
        where: { type_value: { type: newType, value: newValue } },
      })
      if (existing && existing.id !== id) {
        return reply.status(409).send({
          error: `Trigger with type="${newType}" and value="${newValue}" already exists`,
        })
      }
    }

    return prisma.botTrigger.update({ where: { id }, data: body })
  })

  // ── DELETE /triggers/:id — delete trigger ─────────────────────
  app.delete<{ Params: { id: string } }>('/triggers/:id', admin, async (req) => {
    const { id } = req.params
    await prisma.botTrigger.delete({ where: { id } })
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════

  // ── GET /stats — aggregated stats ─────────────────────────────
  app.get('/stats', admin, async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [totalBlocks, totalGroups, totalTriggers, totalButtons, topBlockStats] =
      await Promise.all([
        prisma.botBlock.count(),
        prisma.botBlockGroup.count(),
        prisma.botTrigger.count(),
        prisma.botButton.count(),
        prisma.botBlockStat.groupBy({
          by:       ['blockId'],
          where:    { date: { gte: thirtyDaysAgo } },
          _sum:     { views: true, clicks: true, dropoffs: true },
          orderBy:  { _sum: { views: 'desc' } },
          take:     10,
        }),
      ])

    // Enrich top blocks with name
    const blockIds = topBlockStats.map((s) => s.blockId)
    const blocks = await prisma.botBlock.findMany({
      where:  { id: { in: blockIds } },
      select: { id: true, name: true, type: true },
    })
    const blockMap = new Map(blocks.map((b) => [b.id, b]))

    const topBlocks = topBlockStats.map((s) => ({
      blockId:  s.blockId,
      name:     blockMap.get(s.blockId)?.name ?? '(deleted)',
      type:     blockMap.get(s.blockId)?.type ?? null,
      views:    s._sum.views    ?? 0,
      clicks:   s._sum.clicks   ?? 0,
      dropoffs: s._sum.dropoffs ?? 0,
    }))

    return { totalBlocks, totalGroups, totalTriggers, totalButtons, topBlocks }
  })
}
