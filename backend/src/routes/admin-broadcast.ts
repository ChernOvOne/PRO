import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InlineKeyboard, InputFile } from 'grammy'
import { existsSync, createReadStream } from 'fs'
import { prisma } from '../db'
import { bot } from '../bot'
import { emailService } from '../services/email'
import { logger } from '../utils/logger'

/** Convert media URL/path to something Telegram Bot API accepts */
function resolveMedia(url: string): string | InputFile {
  // Local uploads path → read from disk
  if (url.startsWith('/uploads/') || url.startsWith('/app/uploads/')) {
    const diskPath = url.startsWith('/app/') ? url : `/app${url}`
    if (existsSync(diskPath)) return new InputFile(createReadStream(diskPath))
  }
  // Full URL → pass as-is
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  // Try as local file
  if (existsSync(url)) return new InputFile(createReadStream(url))
  return url
}

// ── Audience filter builder ─────────────────────────────────
function buildAudienceWhere(audience: string, channel?: string) {
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const base: any = {}

  // Channel constraint: email needs email, telegram needs telegramId
  if (channel === 'email') base.email = { not: null }
  else if (channel === 'telegram') base.telegramId = { not: null }
  else if (channel === 'both') {
    // For "both" — user must have at least one contact method
    base.OR = [{ email: { not: null } }, { telegramId: { not: null } }]
  }

  switch (audience) {
    case 'all':
      return { ...base, isActive: true }
    case 'active':
      return { ...base, subStatus: 'ACTIVE' as const }
    case 'inactive':
      return { ...base, subStatus: { not: 'ACTIVE' as const } }
    case 'expiring':
      return {
        ...base,
        subStatus: 'ACTIVE' as const,
        subExpireAt: { gte: now, lte: in7days },
      }
    case 'with_email':
      return { ...base, email: { not: null } }
    case 'with_telegram':
      return { ...base, telegramId: { not: null } }
    default:
      return { ...base, isActive: true }
  }
}

export async function adminBroadcastRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── GET /preview — count recipients for audience + channel ───
  app.get('/preview', admin, async (req) => {
    const qs = z.object({ audience: z.string(), channel: z.string().optional() }).parse(req.query)
    const count = await prisma.user.count({ where: buildAudienceWhere(qs.audience, qs.channel) })
    return { count }
  })

  // ── GET / — list broadcasts ─────────────────────────────────
  app.get('/', admin, async (req) => {
    const qs = z
      .object({
        page:  z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query)

    const { page, limit } = qs
    const offset = (page - 1) * limit

    const [broadcasts, total] = await Promise.all([
      prisma.broadcast.findMany({
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.broadcast.count(),
    ])

    return { broadcasts, total }
  })

  // ── GET /:id — single broadcast ────────────────────────────
  app.get('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const broadcast = await prisma.broadcast.findUnique({ where: { id } })
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' })
    return broadcast
  })

  // ── POST / — create broadcast ──────────────────────────────
  app.post('/', admin, async (req) => {
    const body = z
      .object({
        channel:      z.enum(['telegram', 'email', 'both']),
        audience:     z.enum(['all', 'active', 'inactive', 'expiring', 'with_email', 'with_telegram']),
        tgText:       z.string().optional(),
        tgButtons:    z.array(z.object({ label: z.string(), url: z.string() })).optional(),
        tgMediaType:    z.enum(['photo', 'video', 'animation', 'document']).optional(),
        tgMediaUrl:     z.string().optional(),
        tgParseMode:    z.enum(['Markdown', 'HTML']).default('Markdown'),
        tgPollQuestion: z.string().optional(),
        tgPollOptions:  z.array(z.string()).optional(),
        tgPollAnonymous: z.boolean().default(true),
        tgPollMultiple:  z.boolean().default(false),
        emailSubject: z.string().optional(),
        emailHtml:    z.string().optional(),
        emailBtnText: z.string().optional(),
        emailBtnUrl:  z.string().optional(),
        emailTemplate: z.enum(['dark', 'gradient', 'minimal', 'neon']).default('dark'),
        scheduledAt:  z.string().datetime().optional(),
      })
      .parse(req.body)

    const status = body.scheduledAt ? 'SCHEDULED' : 'DRAFT'

    const broadcast = await prisma.broadcast.create({
      data: {
        channel:      body.channel,
        audience:     body.audience,
        tgText:       body.tgText,
        tgButtons:    body.tgButtons ?? undefined,
        tgMediaType:    body.tgMediaType,
        tgMediaUrl:     body.tgMediaUrl,
        tgParseMode:    body.tgParseMode,
        tgPollQuestion: body.tgPollQuestion,
        tgPollOptions:  body.tgPollOptions ?? undefined,
        tgPollAnonymous: body.tgPollAnonymous,
        tgPollMultiple:  body.tgPollMultiple,
        emailSubject: body.emailSubject,
        emailHtml:    body.emailHtml,
        emailBtnText: body.emailBtnText,
        emailBtnUrl:  body.emailBtnUrl,
        status,
        scheduledAt:  body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      },
    })

    return broadcast
  })

  // ── POST /:id/send — start sending ─────────────────────────
  app.post('/:id/send', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const broadcast = await prisma.broadcast.findUnique({ where: { id } })
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' })
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SCHEDULED') {
      return reply.status(400).send({ error: 'Broadcast cannot be sent in current status' })
    }

    const where = buildAudienceWhere(broadcast.audience, broadcast.channel)
    const recipients = await prisma.user.findMany({
      where,
      select: { id: true, telegramId: true, email: true },
    })

    const totalRecipients = recipients.length

    await prisma.broadcast.update({
      where: { id },
      data: {
        status: 'SENDING',
        startedAt: new Date(),
        totalRecipients,
        sentCount: 0,
        failedCount: 0,
      },
    })

    // Fire-and-forget async sending
    ;(async () => {
      let sentCount = 0
      let failedCount = 0

      for (const user of recipients) {
        try {
          const sendTelegram = broadcast.channel === 'telegram' || broadcast.channel === 'both'
          const sendEmail = broadcast.channel === 'email' || broadcast.channel === 'both'

          // Send Telegram
          if (sendTelegram && user.telegramId) {
            try {
              // Build inline keyboard (skip invalid URLs)
              let reply_markup: InlineKeyboard | undefined
              if (broadcast.tgButtons && Array.isArray(broadcast.tgButtons)) {
                const validBtns = (broadcast.tgButtons as Array<{ label: string; url: string }>)
                  .filter(btn => btn.label && btn.url && /^https?:\/\/.+/.test(btn.url))
                if (validBtns.length > 0) {
                  reply_markup = new InlineKeyboard()
                  for (const btn of validBtns) reply_markup.url(btn.label, btn.url).row()
                }
              }

              const parseMode = (broadcast.tgParseMode as 'Markdown' | 'HTML') || 'Markdown'

              // 1. Send media (photo/video/gif/doc) if attached
              if (broadcast.tgMediaUrl && broadcast.tgMediaType) {
                const media = resolveMedia(broadcast.tgMediaUrl)
                // Caption only if no poll follows (otherwise text goes with poll or separate)
                const hasPoll = !!(broadcast.tgPollQuestion && broadcast.tgPollOptions)
                const caption = !hasPoll ? (broadcast.tgText || undefined) : undefined
                const mediaOpts: any = {
                  ...(caption && { caption, parse_mode: parseMode }),
                  ...(!hasPoll && reply_markup && { reply_markup }),
                }

                switch (broadcast.tgMediaType) {
                  case 'photo':     await bot.api.sendPhoto(user.telegramId, media, mediaOpts); break
                  case 'video':     await bot.api.sendVideo(user.telegramId, media, mediaOpts); break
                  case 'animation': await bot.api.sendAnimation(user.telegramId, media, mediaOpts); break
                  case 'document':  await bot.api.sendDocument(user.telegramId, media, mediaOpts); break
                }
              }

              // 2. Send poll if attached
              if (broadcast.tgPollQuestion && broadcast.tgPollOptions) {
                const pollMsg = await bot.api.sendPoll(
                  user.telegramId,
                  broadcast.tgPollQuestion,
                  (broadcast.tgPollOptions as string[]).map(o => ({ text: o })),
                  {
                    is_anonymous: broadcast.tgPollAnonymous ?? true,
                    allows_multiple_answers: broadcast.tgPollMultiple ?? false,
                  }
                )
                if (!broadcast.tgPollId && pollMsg.poll) {
                  await prisma.broadcast.update({ where: { id }, data: { tgPollId: pollMsg.poll.id } }).catch(() => {})
                  ;(broadcast as any).tgPollId = pollMsg.poll.id
                }
              }

              // 3. Send text separately if needed
              const hasMedia = !!(broadcast.tgMediaUrl && broadcast.tgMediaType)
              const hasPoll = !!(broadcast.tgPollQuestion && broadcast.tgPollOptions)
              const textSentAsCaption = hasMedia && !hasPoll

              if (broadcast.tgText && !textSentAsCaption) {
                await bot.api.sendMessage(user.telegramId, broadcast.tgText, { parse_mode: parseMode, reply_markup })
              }
            } catch (err) {
              logger.warn('Broadcast TG send failed', { err, userId: user.id, telegramId: user.telegramId })
              failedCount++
              continue
            }
          }

          // Send Email (via emailService — uses DB SMTP settings + templates)
          if (sendEmail && user.email && broadcast.emailSubject && broadcast.emailHtml) {
            try {
              await emailService.sendBroadcastEmail({
                to: user.email,
                subject: broadcast.emailSubject,
                html: broadcast.emailHtml,
                btnText: broadcast.emailBtnText ?? undefined,
                btnUrl: broadcast.emailBtnUrl ?? undefined,
                template: (broadcast as any).emailTemplate ?? 'dark',
              })
            } catch (err) {
              logger.warn(`Broadcast email failed for ${user.email}: ${err}`)
              failedCount++
              continue
            }
          }

          sentCount++
        } catch (err) {
          logger.error('Broadcast send error', { err, userId: user.id })
          failedCount++
        }

        // Periodically update counts (every 50 messages)
        if ((sentCount + failedCount) % 50 === 0) {
          await prisma.broadcast.update({
            where: { id },
            data: { sentCount, failedCount },
          }).catch(() => {})
        }
      }

      // Final update
      await prisma.broadcast.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          sentCount,
          failedCount,
        },
      })

      logger.info('Broadcast completed', { broadcastId: id, sentCount, failedCount, totalRecipients })
    })().catch((err) => {
      logger.error('Broadcast sending crashed', { err, broadcastId: id })
      prisma.broadcast.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }).catch(() => {})
    })

    return { ok: true, totalRecipients }
  })

  // ── POST /:id/cancel — cancel broadcast ────────────────────
  app.post('/:id/cancel', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const broadcast = await prisma.broadcast.findUnique({ where: { id } })
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' })

    await prisma.broadcast.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    return { ok: true }
  })

  // ── GET /:id/poll-results — poll results for a broadcast ────
  app.get('/:id/poll-results', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const broadcast = await prisma.broadcast.findUnique({ where: { id } })
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' })
    if (!broadcast.tgPollOptions) return reply.status(400).send({ error: 'No poll in this broadcast' })
    if (!broadcast.tgPollId) return reply.status(400).send({ error: 'Poll has not been sent yet' })

    const setting = await prisma.setting.findUnique({
      where: { key: `poll_results_${broadcast.tgPollId}` },
    })
    const answers: Record<string, number[]> = setting ? JSON.parse(setting.value) : {}

    // Aggregate: count votes per option index
    const options = broadcast.tgPollOptions as string[]
    const voteCounts = options.map(() => 0)
    for (const optionIds of Object.values(answers)) {
      for (const idx of optionIds) {
        if (idx >= 0 && idx < voteCounts.length) voteCounts[idx]++
      }
    }

    return {
      pollId: broadcast.tgPollId,
      options,
      voteCounts,
      totalVoters: Object.keys(answers).length,
    }
  })

  // ── DELETE /:id — delete broadcast (DRAFT/CANCELLED only) ──
  app.delete('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const broadcast = await prisma.broadcast.findUnique({ where: { id } })
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' })
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'CANCELLED') {
      return reply.status(400).send({ error: 'Only DRAFT or CANCELLED broadcasts can be deleted' })
    }

    await prisma.broadcast.delete({ where: { id } })
    return { ok: true }
  })
}
