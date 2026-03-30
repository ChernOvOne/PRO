import type { FastifyInstance } from 'fastify'
import QRCode    from 'qrcode'
import { z }     from 'zod'
import { prisma }    from '../db'
import { remnawave } from '../services/remnawave'
import { balanceService }  from '../services/balance'
import { paymentService }  from '../services/payment'
import { config }    from '../config'

function getClientIp(req: any): string | null {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.ip
    || null
}

export async function userRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // ── Dashboard summary ──────────────────────────────────────
  app.get('/dashboard', auth, async (req, reply) => {
    const userId = (req.user as any).sub

    // Update last IP on each dashboard visit
    prisma.user.update({ where: { id: userId }, data: { lastIp: getClientIp(req) } }).catch(() => {})

    const user = await prisma.user.findUnique({
      where:   { id: userId },
      include: {
        payments:     { orderBy: { createdAt: 'desc' }, take: 5 },
        referrals:    { select: { id: true, createdAt: true, telegramName: true, email: true } },
        bonusHistory: { orderBy: { appliedAt: 'desc' }, take: 10 },
      },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Синхронизация подписки из REMNAWAVE
    let rmStats = null
    if (user.remnawaveUuid) {
      const synced = await remnawave.syncUserSubscription(user.remnawaveUuid)
      if (synced) {
        rmStats = synced
        // Обновляем локальный кеш если данные изменились
        const statusMap: Record<string, string> = {
          ACTIVE: 'ACTIVE', DISABLED: 'INACTIVE', LIMITED: 'ACTIVE', EXPIRED: 'EXPIRED',
        }
        await prisma.user.update({
          where: { id: userId },
          data:  {
            subExpireAt: synced.expireAt ? new Date(synced.expireAt) : null,
            subStatus:   (statusMap[synced.status] ?? 'INACTIVE') as any,
            subLink:     synced.subscriptionUrl,
          },
        })
      }
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

  // ── Get subscription QR + link + REMNAWAVE stats ──────────
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

    // Получаем актуальные данные из REMNAWAVE (трафик, онлайн, дни)
    const rmData = await remnawave.syncUserSubscription(user.remnawaveUuid)

    const subUrl = rmData?.subscriptionUrl
      || user.subLink
      || remnawave.getSubscriptionUrl(user.remnawaveUuid)

    // Обновляем кеш
    if (rmData) {
      const statusMap: Record<string, string> = {
        ACTIVE: 'ACTIVE', DISABLED: 'INACTIVE', LIMITED: 'ACTIVE', EXPIRED: 'EXPIRED',
      }
      await prisma.user.update({
        where: { id: userId },
        data:  {
          subExpireAt: rmData.expireAt ? new Date(rmData.expireAt) : null,
          subStatus:   (statusMap[rmData.status] ?? 'INACTIVE') as any,
          subLink:     subUrl,
        },
      })
    }

    // Generate QR code as base64
    const qrBase64 = await QRCode.toDataURL(subUrl, {
      width:           300,
      margin:          2,
      color:           { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })

    return {
      subUrl,
      qrCode:             qrBase64,
      expireAt:           rmData?.expireAt          ?? user.subExpireAt,
      status:             rmData?.status             ?? user.subStatus,
      usedTrafficBytes:   rmData?.usedTrafficBytes   ?? 0,
      trafficLimitBytes:  rmData?.trafficLimitBytes  ?? null,
      daysLeft:           rmData?.daysLeft           ?? null,
      trafficUsedPercent: rmData?.trafficUsedPercent ?? null,
      onlineAt:           rmData?.onlineAt           ?? null,
      subLastOpenedAt:    rmData?.subLastOpenedAt    ?? null,
      subLastUserAgent:   rmData?.subLastUserAgent   ?? null,
      activeSquads:       rmData?.activeSquads       ?? [],
    }
  })

  // ── Get instructions (platforms) ────────────────────────────
  // Теперь инструкции хранятся в instruction_platforms/apps/steps
  // Публичный маршрут: GET /api/instructions/platforms
  app.get('/instructions', auth, async () => {
    return prisma.instructionPlatform.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        apps: {
          where:   { isActive: true },
          orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
          include: { steps: { orderBy: { order: 'asc' } } },
        },
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
        const subLink = remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl)
        const statusMap: Record<string, string> = {
          ACTIVE: 'ACTIVE', DISABLED: 'INACTIVE', LIMITED: 'ACTIVE', EXPIRED: 'EXPIRED',
        }
        await prisma.user.update({
          where: { id: userId },
          data: {
            remnawaveUuid: rmUser.uuid,
            subStatus:     (statusMap[rmUser.status] ?? 'INACTIVE') as any,
            subExpireAt:   rmUser.expireAt ? new Date(rmUser.expireAt) : null,
            subLink,
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

  // ── HWID Devices ──────────────────────────────────────────
  // GET /api/user/devices — список подключённых устройств
  app.get('/devices', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const user   = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.remnawaveUuid) return reply.status(404).send({ error: 'No subscription' })

    try {
      const result = await remnawave.getDevices(user.remnawaveUuid)
      return result
    } catch (e: any) {
      return reply.status(502).send({ error: 'Failed to load devices' })
    }
  })

  // DELETE /api/user/devices — удалить устройство по hwid
  app.delete('/devices/:hwid', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { hwid } = req.params as { hwid: string }
    const user   = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.remnawaveUuid) return reply.status(404).send({ error: 'No subscription' })

    try {
      await remnawave.deleteDevice(user.remnawaveUuid, hwid)
      return { ok: true }
    } catch (e: any) {
      return reply.status(502).send({ error: 'Failed to delete device' })
    }
  })

  // ── Apply referral code ────────────────────────────────────
  app.post('/apply-referral', { ...auth, schema: { body: { type: 'object' } } }, async (req, reply) => {
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

  // ── Balance ───────────────────────────────────────────────
  app.get('/balance', auth, async (req) => {
    const userId = (req.user as any).sub
    const result = await balanceService.getBalance(userId)
    return {
      balance: Number(result.balance),
      history: result.history.map(t => ({
        ...t,
        amount: Number(t.amount),
      })),
    }
  })

  // Top up balance via payment provider
  app.post('/balance/topup', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const schema = z.object({
      amount:   z.coerce.number().min(50).max(100000),
      provider: z.enum(['YUKASSA', 'CRYPTOPAY']),
      currency: z.string().optional(),
    })
    const { amount, provider, currency } = schema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Create a "virtual" tariff for the top-up amount
    const tariff = {
      id: 'topup',
      name: `Пополнение баланса ${amount} ₽`,
      priceRub: amount,
      priceUsdt: amount / 90, // approximate
      durationDays: 0,
      remnawaveSquads: [],
      remnawaveTag: null,
      remnawaveTagIds: [],
    } as any

    const result = await paymentService.createOrder({
      user,
      tariff,
      provider,
      currency,
      purpose: 'TOPUP',
    })

    return result
  })

  // Purchase with balance
  app.post('/balance/purchase', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { tariffId } = z.object({ tariffId: z.string() }).parse(req.body)

    const [user, tariff] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.tariff.findUnique({ where: { id: tariffId } }),
    ])

    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (!tariff || !tariff.isActive) return reply.status(404).send({ error: 'Тариф не найден' })

    // Debit balance
    try {
      await balanceService.debit({
        userId,
        amount:      tariff.priceRub,
        type:        'PURCHASE',
        description: `Оплата тарифа: ${tariff.name}`,
      })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        tariffId:    tariff.id,
        provider:    'BALANCE',
        amount:      tariff.priceRub,
        currency:    'RUB',
        status:      'PAID',
        purpose:     'SUBSCRIPTION',
        confirmedAt: new Date(),
      },
    })

    // Activate subscription (reuse confirmPayment logic)
    await paymentService.confirmPayment(payment.id)

    return { ok: true }
  })

  // ── Revoke subscription link ──────────────────────────────
  app.post('/revoke-subscription', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const user   = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.remnawaveUuid) return reply.status(400).send({ error: 'Нет подписки' })

    const rmUser = await remnawave.revokeSubscription(user.remnawaveUuid)

    await prisma.user.update({
      where: { id: userId },
      data:  { subLink: remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl) },
    })

    return { ok: true, newSubUrl: rmUser.subscriptionUrl }
  })
}
