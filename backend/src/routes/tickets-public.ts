/**
 * Public ticket endpoints — accessible WITHOUT authentication.
 * Currently only: recovery requests for users who lost access to bot/email.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logger } from '../utils/logger'

const RecoveryTicketSchema = z.object({
  tgUsername:     z.string().min(1).max(100),
  tgId:           z.string().max(50).optional(),
  paymentProof:   z.string().min(1).max(2000),
  desiredEmail:   z.string().email(),
  description:    z.string().max(3000).optional(),
  contactMethod:  z.enum(['email', 'telegram']).default('email'),
})

// Simple in-memory rate limit (3 per IP per day).
// Keyed by IP; for prod behind nginx the x-forwarded-for is already resolved into req.ip.
const recoveryRateLimit = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): { ok: boolean; remaining?: number } {
  const now = Date.now()
  const bucket = recoveryRateLimit.get(ip)
  if (!bucket || bucket.resetAt < now) {
    recoveryRateLimit.set(ip, { count: 1, resetAt: now + 86400_000 })
    return { ok: true, remaining: 2 }
  }
  if (bucket.count >= 3) return { ok: false }
  bucket.count++
  return { ok: true, remaining: 3 - bucket.count }
}

// Clean up old buckets every hour
setInterval(() => {
  const now = Date.now()
  for (const [ip, b] of recoveryRateLimit) {
    if (b.resetAt < now) recoveryRateLimit.delete(ip)
  }
}, 3600_000)

/**
 * Get or create the system user that owns all public recovery tickets.
 * This user exists solely so that Ticket.userId has a valid FK.
 */
async function getSystemRecoveryUser() {
  const RECOVERY_EMAIL = '_system_recovery@hideyou.internal'
  let user = await prisma.user.findUnique({ where: { email: RECOVERY_EMAIL } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: RECOVERY_EMAIL,
        isActive: false,
        role: 'USER',
        customerNotes: 'System user — holds public recovery request tickets',
      },
    })
    logger.info(`Created system recovery user: ${user.id}`)
  }
  return user
}

export async function publicTicketRoutes(app: FastifyInstance) {
  // POST /recovery — no auth required
  app.post('/recovery', async (req, reply) => {
    // Rate limit per IP
    const ip = req.ip || 'unknown'
    const rl = checkRateLimit(ip)
    if (!rl.ok) {
      return reply.status(429).send({
        error: 'Слишком много запросов с этого IP. Попробуйте через 24 часа или напишите на support@hideyou.top',
      })
    }

    const data = RecoveryTicketSchema.parse(req.body)

    // Attach to system user (so Ticket.userId is valid)
    const sysUser = await getSystemRecoveryUser()

    // Build ticket body with all provided details
    const body = [
      `🆘 Запрос на восстановление доступа`,
      ``,
      `👤 TG username: ${data.tgUsername}`,
      data.tgId ? `🆔 TG ID: ${data.tgId}` : '',
      `📧 Желаемый email: ${data.desiredEmail}`,
      `📞 Предпочитает связь через: ${data.contactMethod === 'email' ? 'email' : 'Telegram'}`,
      ``,
      `💳 Подтверждение оплаты / чек:`,
      data.paymentProof,
      ``,
      data.description ? `📝 Дополнительно:\n${data.description}` : '',
      ``,
      `🌐 IP: ${ip}`,
      `🕐 Отправлено: ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n')

    const ticket = await prisma.ticket.create({
      data: {
        userId: sysUser.id,
        subject: `[RECOVERY] ${data.tgUsername} → ${data.desiredEmail}`,
        category: 'RECOVERY',
        priority: 'HIGH',
        source: 'WEB',
        messages: {
          create: {
            authorType: 'USER',
            authorId: sysUser.id,
            body,
            source: 'WEB',
          },
        },
        unreadByAdmin: 1,
        lastMessageAt: new Date(),
      },
    })

    logger.info(`Public recovery ticket created: ${ticket.id} from IP ${ip}, target=${data.desiredEmail}`)

    return {
      ok: true,
      ticketId: ticket.id,
      message: 'Заявка принята. Мы свяжемся с вами в ближайшее время по указанному способу связи.',
      remaining: rl.remaining,
    }
  })
}
