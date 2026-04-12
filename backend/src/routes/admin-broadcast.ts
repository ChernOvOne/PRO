import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InlineKeyboard, InputFile } from 'grammy'
import { existsSync, createReadStream } from 'fs'
import { prisma } from '../db'
import { bot } from '../bot'
import { emailService } from '../services/email'
import { logger } from '../utils/logger'
import { buildUsersWhere } from './admin'

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
// Normalize wizard audience values to legacy switch
const AUDIENCE_ALIAS: Record<string, string> = {
  'active_subscription':   'active',
  'no_subscription':       'inactive',
  'expiring_subscription': 'expiring',
  'email_only':            'with_email',
  'telegram_only':         'with_telegram',
}

async function buildAudienceWhere(audience: string, channel?: string): Promise<any> {
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Normalize alias
  const normalized = AUDIENCE_ALIAS[audience] || audience
  audience = normalized

  const base: any = {}

  // Channel constraint: email needs email, telegram needs telegramId
  if (channel === 'email') base.email = { not: null }
  else if (channel === 'telegram') base.telegramId = { not: null }
  else if (channel === 'both' || channel === 'all') {
    // For "both"/"all" — user must have at least one contact method
    base.OR = [{ email: { not: null } }, { telegramId: { not: null } }]
  }

  // Segment audience: "segment:<id>"
  if (audience && audience.startsWith('segment:')) {
    const segmentId = audience.slice('segment:'.length)
    try {
      const seg = await prisma.userSegment.findUnique({ where: { id: segmentId } })
      if (seg) {
        const filters = (seg.filters as Record<string, any>) || {}
        const segWhere = await buildUsersWhere(filters)
        if ((segWhere as any).__refsPaidMin !== undefined) delete (segWhere as any).__refsPaidMin
        // Merge channel constraint with segment filters
        return { AND: [base, segWhere] }
      }
    } catch (err) {
      logger.warn(`Broadcast: failed to resolve segment ${segmentId}: ${err}`)
    }
    return { ...base, id: '__nonexistent__' } // no users
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
    const qs = z.object({
      audience: z.string(),
      channel: z.string().optional(),
      segmentId: z.string().optional(),
    }).parse(req.query)
    const effective = qs.audience === 'segment' && qs.segmentId
      ? `segment:${qs.segmentId}`
      : qs.audience
    const where = await buildAudienceWhere(effective, qs.channel)
    const count = await prisma.user.count({ where })
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
    // Accept a wide set of fields from wizard; extra fields are ignored gracefully
    const body = z
      .object({
        // Channel: accept 'telegram'|'email'|'lk'|'all'|'both' — map to legacy enum below
        channel:      z.string().default('telegram'),
        // Audience: accept legacy + wizard values
        audience:     z.string().default('all'),
        segmentId:    z.string().optional().nullable(),

        // Telegram — accept both wizard names (tgText / telegramText / tgButtons / telegramButtons)
        tgText:       z.string().optional(),
        telegramText: z.string().optional(),
        tgButtons:    z.array(z.any()).optional(),
        telegramButtons: z.array(z.any()).optional(),
        tgMediaType:    z.string().optional(),
        tgMediaUrl:     z.string().optional(),
        tgParseMode:    z.string().optional(),
        tgPin:          z.boolean().optional(),
        tgDeletePrev:   z.boolean().optional(),
        tgEffectId:     z.string().optional(),
        tgPollQuestion: z.string().optional(),
        tgPollOptions:  z.array(z.string()).optional(),
        tgPollAnonymous: z.boolean().optional(),
        tgPollMultiple:  z.boolean().optional(),

        // Email — accept both (emailBody / emailHtml, emailCtaText / emailBtnText)
        emailSubject: z.string().optional(),
        emailBody:    z.string().optional(),
        emailHtml:    z.string().optional(),
        emailCtaText: z.string().optional(),
        emailBtnText: z.string().optional(),
        emailCtaUrl:  z.string().optional(),
        emailBtnUrl:  z.string().optional(),
        emailTemplate: z.string().optional(),

        // LK
        lkTitle:   z.string().optional(),
        lkMessage: z.string().optional(),
        lkType:    z.string().optional(),

        // Schedule — accept ISO string OR datetime-local
        scheduledAt:  z.string().optional(),

        // Ignore unknown fields silently
      })
      .passthrough()
      .parse(req.body)

    // Normalize aliases
    const tgText = body.tgText ?? body.telegramText
    const tgButtonsRaw = body.tgButtons ?? body.telegramButtons
    const emailHtml = body.emailHtml ?? body.emailBody
    const emailBtnText = body.emailBtnText ?? body.emailCtaText
    const emailBtnUrl = body.emailBtnUrl ?? body.emailCtaUrl

    // Channel mapping (accept 'all'/'lk', store in legacy enum)
    let channel: 'telegram' | 'email' | 'both' = 'telegram'
    if (body.channel === 'email') channel = 'email'
    else if (body.channel === 'all' || body.channel === 'both') channel = 'both'
    else channel = 'telegram'

    // Audience normalization: wizard sends 'active_subscription'... old DB expects 'active'
    const AUDIENCE_MAP: Record<string, string> = {
      'active_subscription': 'active',
      'no_subscription':     'inactive',
      'expiring_subscription':'expiring',
      'email_only':          'with_email',
      'telegram_only':       'with_telegram',
    }
    let audience = AUDIENCE_MAP[body.audience] || body.audience
    if (!['all', 'active', 'inactive', 'expiring', 'with_email', 'with_telegram', 'segment'].includes(audience)) {
      audience = 'all'
    }

    // Parse scheduledAt — accept ISO string or datetime-local
    let scheduledAtDate: Date | undefined
    if (body.scheduledAt) {
      const d = new Date(body.scheduledAt)
      if (!isNaN(d.getTime())) scheduledAtDate = d
    }

    // Filter tgButtons — sanitize objects (keep label + one of url/nextBlockId/type)
    const tgButtons = Array.isArray(tgButtonsRaw)
      ? tgButtonsRaw.filter((b: any) => b && typeof b === 'object')
      : undefined

    const status = scheduledAtDate ? 'SCHEDULED' : 'DRAFT'

    // For segment audience, encode segment id directly in `audience` column
    // as "segment:<id>" so we don't need a schema migration
    const effectiveAudience =
      audience === 'segment' && body.segmentId
        ? `segment:${body.segmentId}`
        : audience

    const broadcast = await prisma.broadcast.create({
      data: {
        channel,
        audience:     effectiveAudience,
        tgText:       tgText || undefined,
        tgButtons:    tgButtons,
        tgMediaType:  (body.tgMediaType as any) || undefined,
        tgMediaUrl:   body.tgMediaUrl || undefined,
        tgParseMode:  (body.tgParseMode === 'HTML' ? 'HTML' : 'Markdown') as any,
        tgPollQuestion: body.tgPollQuestion || undefined,
        tgPollOptions:  body.tgPollOptions ?? undefined,
        tgPollAnonymous: body.tgPollAnonymous ?? true,
        tgPollMultiple:  body.tgPollMultiple ?? false,
        emailSubject: body.emailSubject || undefined,
        emailHtml:    emailHtml || undefined,
        emailBtnText: emailBtnText || undefined,
        emailBtnUrl:  emailBtnUrl || undefined,
        status,
        scheduledAt:  scheduledAtDate,
      },
    })

    return broadcast
  })

  // ── PUT /:id — update broadcast (only DRAFT / SCHEDULED) ─────
  app.put('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const existing = await prisma.broadcast.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Broadcast not found' })
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      return reply.status(400).send({ error: 'Cannot edit broadcast in status ' + existing.status })
    }

    // Reuse same parsing as POST (passthrough)
    const body = z.object({
      channel:      z.string().optional(),
      audience:     z.string().optional(),
      segmentId:    z.string().optional().nullable(),
      tgText:       z.string().optional(),
      telegramText: z.string().optional(),
      tgButtons:    z.array(z.any()).optional(),
      telegramButtons: z.array(z.any()).optional(),
      tgMediaType:    z.string().optional(),
      tgMediaUrl:     z.string().optional(),
      tgParseMode:    z.string().optional(),
      tgPin:          z.boolean().optional(),
      tgDeletePrev:   z.boolean().optional(),
      tgEffectId:     z.string().optional(),
      tgPollQuestion: z.string().optional(),
      tgPollOptions:  z.array(z.string()).optional(),
      tgPollAnonymous: z.boolean().optional(),
      tgPollMultiple:  z.boolean().optional(),
      emailSubject: z.string().optional(),
      emailBody:    z.string().optional(),
      emailHtml:    z.string().optional(),
      emailCtaText: z.string().optional(),
      emailBtnText: z.string().optional(),
      emailCtaUrl:  z.string().optional(),
      emailBtnUrl:  z.string().optional(),
      emailTemplate: z.string().optional(),
      lkTitle:   z.string().optional(),
      lkMessage: z.string().optional(),
      lkType:    z.string().optional(),
      scheduledAt:  z.string().optional(),
      status:    z.string().optional(),
    }).passthrough().parse(req.body)

    // Normalize
    const tgText = body.tgText ?? body.telegramText
    const tgButtonsRaw = body.tgButtons ?? body.telegramButtons
    const emailHtml = body.emailHtml ?? body.emailBody
    const emailBtnText = body.emailBtnText ?? body.emailCtaText
    const emailBtnUrl = body.emailBtnUrl ?? body.emailCtaUrl

    let channel: 'telegram' | 'email' | 'both' | undefined
    if (body.channel === 'email') channel = 'email'
    else if (body.channel === 'all' || body.channel === 'both') channel = 'both'
    else if (body.channel === 'telegram' || body.channel === 'lk') channel = 'telegram'

    const AUDIENCE_MAP_PUT: Record<string, string> = {
      'active_subscription': 'active',
      'no_subscription':     'inactive',
      'expiring_subscription':'expiring',
      'email_only':          'with_email',
      'telegram_only':       'with_telegram',
    }
    let audience = body.audience ? (AUDIENCE_MAP_PUT[body.audience] || body.audience) : undefined
    if (audience === 'segment' && body.segmentId) {
      audience = `segment:${body.segmentId}`
    }

    let scheduledAtDate: Date | null | undefined
    if (body.scheduledAt) {
      const d = new Date(body.scheduledAt)
      if (!isNaN(d.getTime())) scheduledAtDate = d
    }

    const tgButtons = Array.isArray(tgButtonsRaw)
      ? tgButtonsRaw.filter((b: any) => b && typeof b === 'object')
      : undefined

    const data: any = {}
    if (channel !== undefined) data.channel = channel
    if (audience !== undefined) data.audience = audience
    if (tgText !== undefined) data.tgText = tgText
    if (tgButtons !== undefined) data.tgButtons = tgButtons as any
    if (body.tgMediaType !== undefined) data.tgMediaType = body.tgMediaType
    if (body.tgMediaUrl !== undefined) data.tgMediaUrl = body.tgMediaUrl
    if (body.tgParseMode !== undefined) data.tgParseMode = body.tgParseMode === 'HTML' ? 'HTML' : 'Markdown'
    if (body.tgPollQuestion !== undefined) data.tgPollQuestion = body.tgPollQuestion
    if (body.tgPollOptions !== undefined) data.tgPollOptions = body.tgPollOptions as any
    if (body.tgPollAnonymous !== undefined) data.tgPollAnonymous = body.tgPollAnonymous
    if (body.tgPollMultiple !== undefined) data.tgPollMultiple = body.tgPollMultiple
    if (body.emailSubject !== undefined) data.emailSubject = body.emailSubject
    if (emailHtml !== undefined) data.emailHtml = emailHtml
    if (emailBtnText !== undefined) data.emailBtnText = emailBtnText
    if (emailBtnUrl !== undefined) data.emailBtnUrl = emailBtnUrl
    if (scheduledAtDate !== undefined) {
      data.scheduledAt = scheduledAtDate
      data.status = scheduledAtDate ? 'SCHEDULED' : 'DRAFT'
    } else if (body.status === 'DRAFT') {
      data.status = 'DRAFT'
    }

    const updated = await prisma.broadcast.update({ where: { id }, data })
    return updated
  })

  // ── POST /:id/send — start sending ─────────────────────────
  app.post('/:id/send', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const broadcast = await prisma.broadcast.findUnique({ where: { id } })
    if (!broadcast) return reply.status(404).send({ error: 'Broadcast not found' })
    if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SCHEDULED') {
      return reply.status(400).send({ error: 'Broadcast cannot be sent in current status' })
    }

    const where = await buildAudienceWhere(broadcast.audience, broadcast.channel)
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

    // Pre-create recipient records for tracking
    await prisma.broadcastRecipient.createMany({
      data: recipients.map(u => ({
        broadcastId: id,
        userId: u.id,
      })),
      skipDuplicates: true,
    }).catch((err) => {
      logger.warn(`Broadcast pre-create recipients failed: ${err}`)
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
            let firstSentMessage: any = null
            try {
              // Extract effect id from buttons metadata (if any)
              let messageEffectId: string | undefined
              const rawButtons: any[] = Array.isArray(broadcast.tgButtons) ? broadcast.tgButtons as any[] : []
              const effectMeta = rawButtons.find(b => b && b._type === 'effect')
              if (effectMeta?.effectId) messageEffectId = effectMeta.effectId

              // Build inline keyboard from rich buttons (supports url / bot_block / callback)
              // Layout by row/col. Bot block buttons produce callback_data "blk:<uuid>" — the bot
              // main handler already recognizes this format.
              let reply_markup: InlineKeyboard | undefined
              const realButtons = rawButtons.filter(b => b && !b._type && b.label)
              if (realButtons.length > 0) {
                reply_markup = new InlineKeyboard()
                // Group by row
                const rows: Record<number, any[]> = {}
                realButtons.forEach((b, idx) => {
                  const r = typeof b.row === 'number' ? b.row : idx
                  if (!rows[r]) rows[r] = []
                  rows[r].push(b)
                })
                const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b)
                for (const rowNum of rowNums) {
                  const rowBtns = rows[rowNum].sort((a, b) => (a.col ?? 0) - (b.col ?? 0))
                  for (const btn of rowBtns) {
                    // Prepend premium emoji to label (fallback ⭐ — real premium emoji needs HTML parse mode + <tg-emoji>)
                    const label = btn.label as string
                    // For premium emoji on buttons we just include the ID in the label context since
                    // Telegram inline buttons don't support tg-emoji tags in their text. Use label as-is.
                    if (btn.type === 'url' && typeof btn.url === 'string' && /^https?:\/\/.+/.test(btn.url)) {
                      reply_markup.url(label, btn.url)
                    } else if (btn.type === 'bot_block' && btn.botBlockId) {
                      // Route via bot — callback handler recognizes "blk:<uuid>"
                      reply_markup.text(label, `blk:${btn.botBlockId}`)
                    } else if (btn.type === 'callback' && btn.callbackData) {
                      reply_markup.text(label, String(btn.callbackData))
                    } else if (typeof btn.url === 'string' && /^https?:\/\/.+/.test(btn.url)) {
                      // Fallback if type not set but url present
                      reply_markup.url(label, btn.url)
                    }
                  }
                  reply_markup.row()
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

                let mediaMsg: any = null
                switch (broadcast.tgMediaType) {
                  case 'photo':     mediaMsg = await bot.api.sendPhoto(user.telegramId, media, mediaOpts); break
                  case 'video':     mediaMsg = await bot.api.sendVideo(user.telegramId, media, mediaOpts); break
                  case 'animation': mediaMsg = await bot.api.sendAnimation(user.telegramId, media, mediaOpts); break
                  case 'document':  mediaMsg = await bot.api.sendDocument(user.telegramId, media, mediaOpts); break
                }
                if (mediaMsg && !firstSentMessage) firstSentMessage = mediaMsg
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
                if (pollMsg && !firstSentMessage) firstSentMessage = pollMsg
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
                const sendOpts: any = { parse_mode: parseMode, reply_markup }
                if (messageEffectId) sendOpts.message_effect_id = messageEffectId
                const txtMsg = await bot.api.sendMessage(user.telegramId, broadcast.tgText, sendOpts)
                if (txtMsg && !firstSentMessage) firstSentMessage = txtMsg
              }

              // Track successful TG send
              await prisma.broadcastRecipient.update({
                where: { broadcastId_userId: { broadcastId: id, userId: user.id } },
                data: {
                  tgStatus: 'sent',
                  tgMessageId: firstSentMessage?.message_id,
                  tgSentAt: new Date(),
                },
              }).catch(() => {})
            } catch (err: any) {
              logger.warn(`Broadcast TG send failed for user ${user.id}/${user.telegramId}: ${err?.description || err?.message || err}`)
              const desc: string = err?.description || err?.message || String(err)
              const isBotBlocked = desc.includes('blocked by the user')
                || desc.includes('user is deactivated')
                || desc.includes('kicked')
              await prisma.broadcastRecipient.update({
                where: { broadcastId_userId: { broadcastId: id, userId: user.id } },
                data: {
                  tgStatus: isBotBlocked ? 'blocked' : 'failed',
                  tgError: desc.slice(0, 500),
                  botBlocked: isBotBlocked,
                },
              }).catch(() => {})
              failedCount++
              continue
            }
          }

          // Send Email (via emailService — uses DB SMTP settings + templates)
          if (sendEmail && user.email && broadcast.emailSubject && broadcast.emailHtml) {
            try {
              // Lookup recipient record for tracking pixel/click rewriting
              const recipientRow = await prisma.broadcastRecipient.findUnique({
                where: { broadcastId_userId: { broadcastId: id, userId: user.id } },
                select: { id: true },
              }).catch(() => null)
              const rid = recipientRow?.id
              const appUrl = process.env.APP_URL || ''

              // Inject tracking pixel + rewrite links if we have an rid
              let trackedHtml = broadcast.emailHtml || ''
              let trackedBtnUrl = broadcast.emailBtnUrl ?? undefined
              if (rid && appUrl) {
                // Rewrite hrefs in HTML to go through click redirector
                trackedHtml = trackedHtml.replace(
                  /href="(https?:\/\/[^"]+)"/g,
                  (_m, url) => `href="${appUrl}/api/track/click?rid=${rid}&url=${encodeURIComponent(url)}"`
                )
                if (trackedBtnUrl && /^https?:\/\//.test(trackedBtnUrl)) {
                  trackedBtnUrl = `${appUrl}/api/track/click?rid=${rid}&url=${encodeURIComponent(trackedBtnUrl)}`
                }
                // Append tracking pixel
                trackedHtml += `<img src="${appUrl}/api/track/open?rid=${rid}" width="1" height="1" alt="" style="display:none" />`
              }

              await emailService.sendBroadcastEmail({
                to: user.email,
                subject: broadcast.emailSubject,
                html: trackedHtml,
                btnText: broadcast.emailBtnText ?? undefined,
                btnUrl: trackedBtnUrl,
                template: (broadcast as any).emailTemplate ?? 'dark',
              })

              await prisma.broadcastRecipient.update({
                where: { broadcastId_userId: { broadcastId: id, userId: user.id } },
                data: {
                  emailStatus: 'sent',
                  emailSentAt: new Date(),
                },
              }).catch(() => {})
            } catch (err) {
              logger.warn(`Broadcast email failed for ${user.email}: ${err}`)
              await prisma.broadcastRecipient.update({
                where: { broadcastId_userId: { broadcastId: id, userId: user.id } },
                data: {
                  emailStatus: 'failed',
                },
              }).catch(() => {})
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

  // ── GET /:id/stats — full broadcast statistics ──────────────
  app.get('/:id/stats', admin, async (req) => {
    const { id } = req.params as { id: string }

    const [broadcast, recipients, byTgStatus, byEmailStatus, clicks, pollVotes, blocked] = await Promise.all([
      prisma.broadcast.findUnique({ where: { id } }),
      prisma.broadcastRecipient.count({ where: { broadcastId: id } }),
      prisma.broadcastRecipient.groupBy({
        by: ['tgStatus'],
        where: { broadcastId: id },
        _count: { _all: true },
      }),
      prisma.broadcastRecipient.groupBy({
        by: ['emailStatus'],
        where: { broadcastId: id },
        _count: { _all: true },
      }),
      prisma.broadcastRecipient.count({
        where: { broadcastId: id, clickedAt: { not: null } },
      }),
      prisma.broadcastRecipient.groupBy({
        by: ['pollOptionIdx'],
        where: { broadcastId: id, pollOptionIdx: { not: null } },
        _count: { _all: true },
      }),
      prisma.broadcastRecipient.count({
        where: { broadcastId: id, botBlocked: true },
      }),
    ])

    return {
      broadcast,
      recipients,
      tgStats: Object.fromEntries(byTgStatus.map(r => [r.tgStatus || 'unknown', r._count._all])),
      emailStats: Object.fromEntries(byEmailStatus.map(r => [r.emailStatus || 'unknown', r._count._all])),
      clicks,
      pollVotes: pollVotes.map(v => ({ option: v.pollOptionIdx, count: v._count._all })),
      blocked,
    }
  })

  // ── GET /:id/recipients — recipient list with filtering ─────
  app.get('/:id/recipients', admin, async (req) => {
    const { id } = req.params as { id: string }
    const q = req.query as { page?: string; limit?: string; filter?: string }
    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(100, Number(q.limit) || 20)

    const where: any = { broadcastId: id }
    if (q.filter === 'blocked') where.botBlocked = true
    if (q.filter === 'clicked') where.clickedAt = { not: null }
    if (q.filter === 'failed') where.tgStatus = 'failed'
    if (q.filter === 'sent') where.tgStatus = 'sent'

    const [items, total] = await Promise.all([
      prisma.broadcastRecipient.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, telegramName: true, telegramId: true } },
        },
      }),
      prisma.broadcastRecipient.count({ where }),
    ])

    return { items, total, page, limit }
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
