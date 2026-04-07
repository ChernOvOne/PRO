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

    logger.info(`Remnawave webhook received: ${event} uuid=${data?.uuid}`)

    // Find user by remnawave UUID
    const uuid = data?.uuid || data?.userUuid
    if (!uuid) {
      logger.warn(`Remnawave webhook: no UUID in payload, event=${event}`)
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

    // Map events to funnel triggers
    const EVENT_MAP: Record<string, string> = {
      'user.created': 'registration',
      'user.first_connection': 'first_connection',
      'user.expired': 'expired',
      'user.expiration_72h': 'expiring_72h',
      'user.expiration_48h': 'expiring_48h',
      'user.expiration_24h': 'expiring_24h',
      'user.limited': 'traffic_limit',
      'user.inactive': 'inactive',
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
