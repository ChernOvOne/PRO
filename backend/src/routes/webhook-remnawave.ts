import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../db'
import { logger } from '../utils/logger'
import { triggerEvent } from '../services/funnel-engine'

export async function remnawaveWebhookRoutes(app: FastifyInstance) {
  // POST /remnawave — public webhook (no auth), HMAC verification
  app.post('/remnawave', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const secret = process.env.REMNAWAVE_WEBHOOK_SECRET
    if (!secret) {
      logger.warn('REMNAWAVE_WEBHOOK_SECRET not configured, rejecting webhook')
      return reply.status(500).send({ error: 'Webhook secret not configured' })
    }

    // Verify HMAC signature
    const signature = req.headers['x-remnawave-signature'] as string | undefined
    if (!signature) {
      logger.warn('Remnawave webhook: missing signature header')
      return reply.status(401).send({ error: 'Missing signature' })
    }

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      logger.warn('Remnawave webhook: invalid signature')
      return reply.status(401).send({ error: 'Invalid signature' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const event = body.event as string
    const data = body.data || body

    // REMNAWAVE кладёт UUID юзера в разные поля в зависимости от типа события:
    // - user.*        → data.uuid
    // - user_hwid_*   → data.userUuid
    // - nested user   → data.user.uuid
    const uuid = data?.uuid
      || data?.userUuid
      || data?.user_uuid
      || data?.user?.uuid
      || null

    logger.info(`Remnawave webhook received: ${event} uuid=${uuid}`)

    if (!uuid) {
      logger.warn(`Remnawave webhook: no UUID in payload, event=${event}, payload keys=${Object.keys(data || {}).join(',')}`)
      return { ok: true, skipped: true, reason: 'no UUID' }
    }

    const user = await prisma.user.findFirst({
      where: { remnawaveUuid: uuid },
      select: { id: true },
    })

    if (!user) {
      logger.warn(`Remnawave webhook: user not found by UUID=${uuid}, event=${event}`)
      return { ok: true, skipped: true, reason: 'user not found' }
    }

    // Map REMNAWAVE events to funnel triggers.
    // Real event names verified from incoming webhook logs.
    const EVENT_MAP: Record<string, string> = {
      'user.created':              'registration',
      'user.first_connected':      'first_connection',
      'user.expired':              'expired',
      'user.expired_24_hours_ago': 'expired',
      'user.expires_in_72_hours':  'expiring_3d',
      'user.expires_in_48_hours':  'expiring_3d',
      'user.expires_in_24_hours':  'expiring_1d',
      'user.limited':              'traffic_100',
      'user.traffic_reset':        'traffic_reset',
      'user.disabled':             'inactive',
      'user_hwid_devices.added':   'new_device',
      'user_hwid_devices.deleted': 'device_removed',
    }

    // Special handling: bandwidth threshold reached — reroute by percentage
    // to different triggers (traffic_50 / traffic_80 / traffic_95).
    // Also pass threshold as {trafficPercent} variable for the funnel message.
    if (event === 'user.bandwidth_usage_threshold_reached') {
      // REMNAWAVE passes threshold in various possible fields — try them all
      const threshold = Number(
        data?.threshold ?? data?.thresholdPct ?? data?.percent ?? data?.pct ?? 0
      )
      let triggerId = 'traffic_80' // safe default
      if (threshold >= 95) triggerId = 'traffic_95'
      else if (threshold >= 80) triggerId = 'traffic_80'
      else if (threshold >= 50) triggerId = 'traffic_50'

      logger.info(`Remnawave webhook: bandwidth threshold ${threshold}% → trigger ${triggerId}`)
      try {
        await triggerEvent(triggerId, user.id, { trafficPercent: String(threshold) })
        logger.info(`Remnawave webhook: funnel triggered ${triggerId} for user ${user.id}`)
      } catch (e: any) {
        logger.error(`Remnawave webhook: trigger failed ${triggerId} for user ${user.id}: ${e.message}`)
      }
      return { ok: true }
    }

    const triggerId = EVENT_MAP[event]
    if (triggerId) {
      try {
        await triggerEvent(triggerId, user.id)
        logger.info(`Remnawave webhook: funnel triggered ${triggerId} for user ${user.id}`)
      } catch (e: any) {
        logger.error(`Remnawave webhook: trigger failed ${triggerId} for user ${user.id}: ${e.message}`)
      }
    } else {
      logger.info(`Remnawave webhook: no funnel mapping for event ${event}`)
    }

    return { ok: true }
  })
}
