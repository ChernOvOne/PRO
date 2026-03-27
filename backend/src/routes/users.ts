import type { FastifyInstance } from 'fastify'
import QRCode    from 'qrcode'
import { prisma }    from '../db'
import { remnawave } from '../services/remnawave'
import { config }    from '../config'

export async function userRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // ── Dashboard summary ──────────────────────────────────────
  app.get('/dashboard', auth, async (req, reply) => {
    const userId = (req.user as any).sub

    const user = await prisma.user.findUnique({
      where:   { id: userId },
      include: {
        payments:     { orderBy: { createdAt: 'desc' }, take: 5 },
        referrals:    { select: { id: true, createdAt: true, telegramName: true, email: true } },
        bonusHistory: { orderBy: { appliedAt: 'desc' }, take: 10 },
      },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Sync subscription from REMNAWAVE if linked
    let rmStats = null
    if (user.remnawaveUuid) {
      try {
        const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
        rmStats = {
          status:          rmUser.status,
          expireAt:        rmUser.expireAt,
          usedTrafficBytes: rmUser.usedTrafficBytes,
          trafficLimitBytes: rmUser.trafficLimitBytes,
        }
        // Update local cache if differs
        if (
          rmUser.expireAt !== user.subExpireAt?.toISOString() ||
          (rmUser.status !== 'ACTIVE' && user.subStatus === 'ACTIVE')
        ) {
          await prisma.user.update({
            where: { id: userId },
            data:  {
              subExpireAt: rmUser.expireAt ? new Date(rmUser.expireAt) : null,
              subStatus:   rmUser.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
            },
          })
        }
      } catch { /* REMNAWAVE unavailable — use cached data */ }
    }

    const { passwordHash, ...safeUser } = user as any
    return {
      user:    safeUser,
      rmStats,
      referralUrl: `${config.appUrl}?ref=${user.referralCode}`,
      referralCount: user.referrals.length,
      bonusDaysEarned: user.bonusHistory.reduce((s, b) => s + b.bonusDays, 0),
    }
  })

  // ── Get subscription QR + link ──────────────────────────────
  app.get('/subscription', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const user   = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    if (!user.remnawaveUuid) {
      return reply.status(404).send({
        error: 'No active subscription',
        hint:  'Purchase a plan to get started',
      })
    }

    const subUrl = user.subLink || remnawave.getSubscriptionUrl(user.remnawaveUuid)

    // Generate QR code as base64
    const qrBase64 = await QRCode.toDataURL(subUrl, {
      width:           300,
      margin:          2,
      color:           { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })

    return {
      subUrl,
      qrCode:  qrBase64,
      expireAt: user.subExpireAt,
      status:   user.subStatus,
    }
  })

  // ── Get instructions ───────────────────────────────────────
  app.get('/instructions', auth, async () => {
    return prisma.instruction.findMany({
      where:   { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { deviceType: 'asc' }],
      select:  {
        id: true, title: true, deviceType: true,
        content: true, sortOrder: true,
      },
    })
  })

  // ── Get payment history ────────────────────────────────────
  app.get('/payments', auth, async (req) => {
    const userId = (req.user as any).sub
    return prisma.payment.findMany({
      where:   { userId },
      include: { tariff: { select: { name: true, durationDays: true } } },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })
  })

  // ── Get referral info ──────────────────────────────────────
  app.get('/referral', auth, async (req) => {
    const userId = (req.user as any).sub
    const user = await prisma.user.findUnique({
      where:   { id: userId },
      include: {
        referrals: {
          select: {
            id: true, createdAt: true,
            telegramName: true, email: true,
            payments: {
              where:  { status: 'PAID' },
              select: { id: true },
            },
          },
        },
        bonusHistory: {
          orderBy: { appliedAt: 'desc' },
          include: { triggeredByPayment: { select: { confirmedAt: true } } },
        },
      },
    })
    if (!user) return {}

    return {
      referralCode:    user.referralCode,
      referralUrl:     `${config.appUrl}?ref=${user.referralCode}`,
      referrals:       user.referrals.map(r => ({
        id:          r.id,
        joinedAt:    r.createdAt,
        displayName: r.telegramName || r.email?.split('@')[0] || 'User',
        hasPaid:     r.payments.length > 0,
      })),
      bonusDaysEarned: user.bonusHistory.reduce((s, b) => s + b.bonusDays, 0),
      bonusHistory:    user.bonusHistory,
      bonusPerReferral: config.referral.bonusDays,
    }
  })

  // ── Sync subscription from REMNAWAVE ──────────────────────
  app.post('/sync', auth, async (req) => {
    const userId = (req.user as any).sub
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return { ok: false }

    // Try match by email or telegramId if not linked
    if (!user.remnawaveUuid) {
      let rmUser = null
      if (user.email) rmUser = await remnawave.getUserByEmail(user.email)
      if (!rmUser && user.telegramId) rmUser = await remnawave.getUserByTelegramId(user.telegramId)

      if (rmUser) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            remnawaveUuid: rmUser.uuid,
            subStatus:     rmUser.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
            subExpireAt:   rmUser.expireAt ? new Date(rmUser.expireAt) : null,
            subLink:       remnawave.getSubscriptionUrl(rmUser.uuid),
          },
        })
        return { ok: true, linked: true }
      }
      return { ok: false, linked: false }
    }

    const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
    await prisma.user.update({
      where: { id: userId },
      data: {
        subStatus:   rmUser.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        subExpireAt: rmUser.expireAt ? new Date(rmUser.expireAt) : null,
      },
    })
    return { ok: true, synced: true }
  })

  // ── Apply referral code ────────────────────────────────────
  app.post('/apply-referral', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { code } = req.body as { code?: string }

    if (!code) return reply.status(400).send({ error: 'code required' })

    const user = await prisma.user.findUnique({
      where:   { id: userId },
      include: { payments: { where: { status: 'PAID' }, take: 1 } },
    })
    if (!user) return reply.status(404).send({ error: 'Not found' })
    if (user.referredById) return reply.status(400).send({ error: 'Already applied' })
    if ((user as any).payments?.length > 0) {
      return reply.status(400).send({ error: 'Already made a purchase' })
    }

    const referrer = await prisma.user.findUnique({
      where:  { referralCode: code },
      select: { id: true, telegramName: true },
    })
    if (!referrer) return reply.status(404).send({ error: 'Invalid code' })
    if (referrer.id === userId) return reply.status(400).send({ error: 'Cannot self-refer' })

    await prisma.user.update({
      where: { id: userId },
      data:  { referredById: referrer.id },
    })

    return { ok: true, referrerName: referrer.telegramName || 'Friend' }
  })

  // ── Profile update ─────────────────────────────────────────
  app.patch('/profile', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const body   = req.body as { email?: string }

    // Validate email if provided
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return reply.status(400).send({ error: 'Invalid email' })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  body.email ? { email: body.email } : {},
    })
    const { passwordHash, ...safe } = updated as any
    return safe
  })
}
