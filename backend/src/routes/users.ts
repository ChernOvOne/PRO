import type { FastifyInstance } from 'fastify'
import QRCode    from 'qrcode'
import { z }     from 'zod'
import axios     from 'axios'
import { prisma }    from '../db'
import { remnawave } from '../services/remnawave'
import { balanceService }  from '../services/balance'
import { paymentService }  from '../services/payment'
import { config }    from '../config'
import { logger }    from '../utils/logger'

// Lightweight geo lookup used to backfill User.geoInfo (lat/lon/country/city) on
// dashboard visits. In-memory cache to avoid hammering the public API.
// Skips VPN/proxy/hosting IPs so the map shows real user locations.
const _geoCache = new Map<string, { data: any; ts: number }>()
async function lookupGeo(ip: string | null): Promise<any | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.')) return null
  const cached = _geoCache.get(ip)
  if (cached && Date.now() - cached.ts < 3600_000) return cached.data
  try {
    // Request extra fields: proxy, hosting to detect VPN/datacenter IPs
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,regionName,isp,lat,lon,query,proxy,hosting,mobile`, { timeout: 3000 })
    if (res.data?.status === 'success') {
      // Skip VPN / proxy / datacenter IPs — these are not real user locations
      if (res.data.proxy === true || res.data.hosting === true) {
        _geoCache.set(ip, { data: null, ts: Date.now() })
        return null
      }
      const geo = {
        ip: res.data.query, country: res.data.country, city: res.data.city,
        region: res.data.regionName, isp: res.data.isp,
        lat: res.data.lat, lon: res.data.lon,
        mobile: res.data.mobile,
      }
      _geoCache.set(ip, { data: geo, ts: Date.now() })
      return geo
    }
  } catch {}
  return null
}

/** REMNAWAVE username: only letters, numbers, underscores, dashes */
function toRmUsername(user: { email?: string | null; telegramId?: string | null; id: string }): string {
  if (user.email) return user.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_')
  if (user.telegramId) return `tg_${user.telegramId}`
  return `user_${user.id.slice(0, 8)}`
}

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

    // Update last IP on each dashboard visit + lookup geo (fire-and-forget)
    {
      const ip = getClientIp(req)
      prisma.user.update({ where: { id: userId }, data: { lastIp: ip } }).catch(() => {})
      if (ip) {
        lookupGeo(ip).then(geo => {
          if (geo) {
            prisma.user.update({ where: { id: userId }, data: { geoInfo: geo } }).catch(() => {})
          }
        }).catch(() => {})
      }
    }

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
      bonusDays: user.bonusDays, // admin-granted bonus days
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

  // ── Get payment history (enriched with yukassaStatus metadata) ──
  app.get('/payments', auth, async (req) => {
    const userId = (req.user as any).sub
    const payments = await prisma.payment.findMany({
      where:   { userId },
      include: { tariff: { select: { name: true, durationDays: true } } },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })
    return payments.map(p => ({
      ...p,
      parsedMeta: parseYukassaStatus(p.yukassaStatus),
    }))
  })

  // ── Unified activity log ──────────────────────────────────
  app.get('/activity', auth, async (req) => {
    const userId = (req.user as any).sub
    const { type, page = '1', limit = '20' } = req.query as Record<string, string>
    const take = Math.min(Number(limit) || 20, 100)
    const skip = ((Number(page) || 1) - 1) * take

    const items = await buildActivityLog(userId, type || null, skip, take)
    return { items, page: Number(page) || 1, limit: take }
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
            subStatus: true,
            payments: {
              where: {
                status: 'PAID',
                amount: { gt: 0 },
                provider: { in: ['YUKASSA', 'CRYPTOPAY'] },
              },
              select: { id: true, amount: true, createdAt: true },
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
        subStatus:   r.subStatus,
        hasPaid:     r.payments.length > 0,  // real money payments only
        totalPaid:   r.payments.reduce((s: number, p: any) => s + (p.amount || 0), 0),
        lastPayment: r.payments[0]?.createdAt || null,
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

    // Create payment record as PENDING, then confirmPayment will set PAID + activate
    const payment = await prisma.payment.create({
      data: {
        userId,
        tariffId:    tariff.id,
        provider:    'BALANCE',
        amount:      tariff.priceRub,
        currency:    'RUB',
        status:      'PENDING',
        purpose:     'SUBSCRIPTION',
      },
    })

    // confirmPayment sets PAID + activates REMNAWAVE subscription
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

  // ── Redeem referral days ──────────────────────────────────
  app.post('/referral/redeem', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { days } = z.object({ days: z.coerce.number().min(1) }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Calculate available days: sum of all bonusDays (positive = earned, negative = redeemed)
    const bonuses = await prisma.referralBonus.findMany({
      where: { referrerId: userId },
      select: { bonusDays: true },
    })
    const totalEarned = bonuses.reduce((sum, b) => sum + b.bonusDays, 0)

    if (days > totalEarned) {
      return reply.status(400).send({ error: `Недостаточно дней. Доступно: ${totalEarned}` })
    }

    // Get cheapest tariff for settings (traffic, devices, etc.)
    const cheapestTariff = await prisma.tariff.findFirst({
      where: { isActive: true, type: 'SUBSCRIPTION' },
      orderBy: { priceRub: 'asc' },
    })

    if (!user.remnawaveUuid) {
      if (!cheapestTariff) return reply.status(400).send({ error: 'Нет доступных тарифов' })

      // Create REMNAWAVE user with cheapest tariff settings
      const trafficLimitBytes = cheapestTariff.trafficGb ? cheapestTariff.trafficGb * 1024 * 1024 * 1024 : 0
      const rmUser = await remnawave.createUser({
        username:             user.email || `tg_${user.telegramId}` || `user_${user.id.slice(0, 8)}`,
        email:                user.email ?? undefined,
        telegramId:           user.telegramId ? parseInt(user.telegramId, 10) : null,
        expireAt:             new Date(Date.now() + days * 86400_000).toISOString(),
        trafficLimitBytes,
        trafficLimitStrategy: cheapestTariff.trafficStrategy || 'MONTH',
        hwidDeviceLimit:      cheapestTariff.deviceLimit ?? 3,
        tag:                  cheapestTariff.remnawaveTag ?? undefined,
        activeInternalSquads: cheapestTariff.remnawaveSquads.length > 0 ? cheapestTariff.remnawaveSquads : undefined,
      })

      await prisma.user.update({
        where: { id: userId },
        data: {
          remnawaveUuid: rmUser.uuid,
          subLink: remnawave.getSubscriptionUrl(rmUser.uuid),
          subStatus: 'ACTIVE',
          subExpireAt: new Date(Date.now() + days * 86400_000),
        },
      })
    } else {
      // Extend existing subscription
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      const currentExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : new Date()
      const isExpired = currentExpire <= new Date()
      const base = isExpired ? new Date() : currentExpire
      base.setDate(base.getDate() + days)

      const updateData: any = {
        uuid: user.remnawaveUuid,
        status: 'ACTIVE',
        expireAt: base.toISOString(),
      }

      // Only apply cheapest tariff settings if subscription is expired/new
      // If active — just extend days, don't touch traffic/devices/etc
      if (isExpired && cheapestTariff) {
        updateData.trafficLimitBytes = cheapestTariff.trafficGb ? cheapestTariff.trafficGb * 1024 * 1024 * 1024 : 0
        updateData.trafficLimitStrategy = cheapestTariff.trafficStrategy || 'MONTH'
        updateData.hwidDeviceLimit = cheapestTariff.deviceLimit ?? 3
      }

      await remnawave.updateUser(updateData)

      await prisma.user.update({
        where: { id: userId },
        data: { subStatus: 'ACTIVE', subExpireAt: base },
      })
    }

    // Record in payment history
    const tariffId = cheapestTariff?.id || (await prisma.tariff.findFirst({ select: { id: true } }))!.id
    const dummyPayment = await prisma.payment.create({
      data: {
        userId,
        tariffId,
        provider: 'MANUAL',
        amount: 0,
        currency: 'RUB',
        status: 'PAID',
        purpose: 'SUBSCRIPTION',
        confirmedAt: new Date(),
        yukassaStatus: JSON.stringify({ _type: 'referral_redeem', days }),
      },
    })

    await prisma.referralBonus.create({
      data: {
        referrerId: userId,
        triggeredByPaymentId: dummyPayment.id,
        bonusType: 'DAYS',
        bonusDays: -days,
      },
    })

    return { ok: true, redeemedDays: days, remainingDays: totalEarned - days }
  })

  // ── Redeem admin-granted bonus days ──────────────────────
  app.post('/bonus-days/redeem', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { days } = z.object({ days: z.coerce.number().min(1) }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (user.bonusDays < days) return reply.status(400).send({ error: `Недостаточно дней. Доступно: ${user.bonusDays}` })

    // Get cheapest tariff for settings
    const cheapestTariff = await prisma.tariff.findFirst({
      where: { isActive: true, type: 'SUBSCRIPTION' },
      orderBy: { priceRub: 'asc' },
    })

    if (!user.remnawaveUuid) {
      if (!cheapestTariff) return reply.status(400).send({ error: 'Нет доступных тарифов' })
      const trafficLimitBytes = cheapestTariff.trafficGb ? cheapestTariff.trafficGb * 1024 * 1024 * 1024 : 0
      const rmUser = await remnawave.createUser({
        username: toRmUsername(user),
        email: user.email ?? undefined,
        telegramId: user.telegramId ? parseInt(user.telegramId, 10) : null,
        expireAt: new Date(Date.now() + days * 86400_000).toISOString(),
        trafficLimitBytes,
        trafficLimitStrategy: cheapestTariff.trafficStrategy || 'MONTH',
        hwidDeviceLimit: cheapestTariff.deviceLimit ?? 3,
      })
      await prisma.user.update({
        where: { id: userId },
        data: { remnawaveUuid: rmUser.uuid, subLink: remnawave.getSubscriptionUrl(rmUser.uuid), subStatus: 'ACTIVE', subExpireAt: new Date(Date.now() + days * 86400_000), bonusDays: { decrement: days } },
      })
    } else {
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      const currentExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : new Date()
      const isExpired = currentExpire <= new Date()
      const base = isExpired ? new Date() : currentExpire
      base.setDate(base.getDate() + days)
      const updateData: any = { uuid: user.remnawaveUuid, status: 'ACTIVE', expireAt: base.toISOString() }
      if (isExpired && cheapestTariff) {
        updateData.trafficLimitBytes = cheapestTariff.trafficGb ? cheapestTariff.trafficGb * 1024 * 1024 * 1024 : 0
        updateData.trafficLimitStrategy = cheapestTariff.trafficStrategy || 'MONTH'
        updateData.hwidDeviceLimit = cheapestTariff.deviceLimit ?? 3
      }
      await remnawave.updateUser(updateData)
      await prisma.user.update({
        where: { id: userId },
        data: { subStatus: 'ACTIVE', subExpireAt: base, bonusDays: { decrement: days } },
      })
    }

    // Record in user activity
    await prisma.balanceTransaction.create({
      data: {
        userId,
        amount: days,
        type: 'GIFT',
        description: `Подписка продлена на ${days} дней (бонусные дни)`,
      },
    })

    return { ok: true, redeemedDays: days, remainingDays: user.bonusDays - days }
  })

  // ── Activate trial subscription ────────────────────────────
  app.post('/trial/activate', auth, async (req, reply) => {
    const userId = (req.user as any).sub

    if (!config.features.trial) {
      return reply.status(400).send({ error: 'Пробный период недоступен' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (user.remnawaveUuid) return reply.status(400).send({ error: 'У вас уже есть подписка' })

    // First look for a tariff marked as trial, otherwise fallback to cheapest
    const trialTariff = await prisma.tariff.findFirst({ where: { isTrial: true } })
    const tariff = trialTariff || await prisma.tariff.findFirst({
      where: { isActive: true, type: 'SUBSCRIPTION' },
      orderBy: { priceRub: 'asc' },
    })
    if (!tariff) return reply.status(400).send({ error: 'Нет доступных тарифов' })

    const trialDays = tariff.durationDays || config.features.trialDays || 3
    const trafficLimitBytes = tariff.trafficGb ? tariff.trafficGb * 1024 * 1024 * 1024 : 0
    const expireAt = new Date(Date.now() + trialDays * 86400_000).toISOString()

    try {
      // Search for existing REMNAWAVE user: email → telegramId → username
      let rmUser: any = null
      let isExisting = false

      if (user.email) {
        rmUser = await remnawave.getUserByEmail(user.email).catch(() => null)
      }
      if (!rmUser && user.telegramId) {
        rmUser = await remnawave.getUserByTelegramId(user.telegramId).catch(() => null)
      }
      if (!rmUser) {
        const username = toRmUsername(user)
        rmUser = await remnawave.getUserByUsername(username).catch(() => null)
      }

      if (rmUser) {
        // User exists — just LINK, don't extend (no trial bonus for existing users)
        isExisting = true
        logger.info(`Trial: linking existing REMNAWAVE user ${rmUser.uuid} to ${userId}`)
        // Only activate if disabled
        if (rmUser.status !== 'ACTIVE') {
          await remnawave.updateUser({ uuid: rmUser.uuid, status: 'ACTIVE' })
        }
      } else {
        // Create new with unique username
        let username = toRmUsername(user)
        try {
          rmUser = await remnawave.createUser({
            username,
            email: user.email ?? undefined,
            telegramId: user.telegramId ? parseInt(user.telegramId, 10) : null,
            expireAt,
            trafficLimitBytes,
            trafficLimitStrategy: tariff.trafficStrategy || 'MONTH',
            hwidDeviceLimit: tariff.deviceLimit > 0 ? tariff.deviceLimit : undefined,
            tag: tariff.remnawaveTag ?? undefined,
            activeInternalSquads: tariff.remnawaveSquads.length > 0 ? tariff.remnawaveSquads : undefined,
          })
        } catch (e: any) {
          if (e.response?.data?.errorCode === 'A019' || e.response?.data?.message?.includes('username already exists')) {
            username = `${username}_${user.id.slice(0, 6)}`
            rmUser = await remnawave.createUser({
              username,
              email: user.email ?? undefined,
              telegramId: user.telegramId ? parseInt(user.telegramId, 10) : null,
              expireAt,
              trafficLimitBytes,
              trafficLimitStrategy: tariff.trafficStrategy || 'MONTH',
              hwidDeviceLimit: tariff.deviceLimit > 0 ? tariff.deviceLimit : undefined,
              tag: tariff.remnawaveTag ?? undefined,
              activeInternalSquads: tariff.remnawaveSquads.length > 0 ? tariff.remnawaveSquads : undefined,
            })
          } else {
            throw e
          }
        }
      }

      // Use actual REMNAWAVE expireAt if user was existing, otherwise use trial expireAt
      const actualExpireAt = isExisting && rmUser.expireAt ? new Date(rmUser.expireAt) : new Date(expireAt)

      await prisma.user.update({
        where: { id: userId },
        data: {
          remnawaveUuid: rmUser.uuid,
          subLink: remnawave.getSubscriptionUrl(rmUser.uuid),
          subStatus: 'ACTIVE',
          subExpireAt: actualExpireAt,
        },
      })

      // Log as payment only if new trial (not linking existing)
      if (!isExisting) {
        await prisma.payment.create({
          data: {
            userId,
            tariffId: tariff.id,
            provider: 'MANUAL',
            amount: 0,
            currency: 'RUB',
            status: 'PAID',
            purpose: 'SUBSCRIPTION',
            confirmedAt: new Date(),
            yukassaStatus: JSON.stringify({ _type: 'trial', days: trialDays }),
          },
        })
      }

      const daysLeft = Math.max(0, Math.ceil((actualExpireAt.getTime() - Date.now()) / 86_400_000))
      logger.info(`Trial ${isExisting ? 'linked existing' : 'activated'} for user ${userId}: ${daysLeft} days left`)
      return { ok: true, days: daysLeft, tariffName: tariff.name, linked: isExisting }
    } catch (err: any) {
      logger.error(`Trial activation failed for ${userId}: ${err.message}`)
      return reply.status(500).send({ error: err.message || 'Не удалось создать пробную подписку' })
    }
  })
}

// ── Shared helpers (exported for admin routes) ──────────────

export function parseYukassaStatus(raw: string | null): Record<string, any> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const meta: Record<string, any> = {}

    if (parsed._type) meta.type = parsed._type          // e.g. referral_redeem, bonus_redeem
    if (parsed._mode) meta.mode = parsed._mode           // variant | configurator
    if (parsed.days != null) meta.days = parsed.days
    if (parsed.variantIndex != null) meta.variantIndex = parsed.variantIndex
    if (parsed.trafficGb != null) meta.trafficGb = parsed.trafficGb
    if (parsed.devices != null) meta.devices = parsed.devices
    if (parsed.price != null) meta.price = parsed.price
    if (parsed.promoCode) meta.promoCode = parsed.promoCode
    if (parsed.discountPct != null) meta.discountPct = parsed.discountPct
    if (parsed.originalAmount != null) meta.originalAmount = parsed.originalAmount

    // pass through any other keys that start without underscore
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('_') && !(k in meta)) meta[k] = v
    }

    return Object.keys(meta).length ? meta : parsed
  } catch {
    return null
  }
}

interface ActivityEntry {
  id: string
  type: 'payment' | 'trial' | 'promo' | 'balance' | 'bonus_redeem' | 'referral_redeem' | 'balance_purchase'
  description: string
  amount: number | null
  date: Date
  metadata: Record<string, any>
}

export async function buildActivityLog(
  userId: string,
  typeFilter: string | null,
  skip: number,
  take: number,
): Promise<ActivityEntry[]> {
  const types = typeFilter ? typeFilter.split(',').map(t => t.trim()) : null

  const entries: ActivityEntry[] = []

  // --- Payments ---
  const allPaymentTypes = ['payment', 'trial', 'bonus_redeem', 'referral_redeem', 'balance_purchase', 'bonus', 'referral']
  const includePayments = !types || types.some(t => allPaymentTypes.includes(t))
  if (includePayments) {
    const payments = await prisma.payment.findMany({
      where:   { userId },
      include: { tariff: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })

    for (const p of payments) {
      const meta = parseYukassaStatus(p.yukassaStatus)
      let entryType: ActivityEntry['type'] = 'payment'
      if (meta?.type === 'trial')           entryType = 'trial'
      if (meta?.type === 'bonus_redeem')    entryType = 'bonus_redeem'
      if (meta?.type === 'referral_redeem') entryType = 'referral_redeem'
      if (p.provider === 'BALANCE' && p.amount > 0) entryType = 'balance_purchase'

      // Apply type filter
      if (types) {
        const match = types.some(t => {
          if (t === entryType) return true
          if (t === 'bonus' && entryType === 'bonus_redeem') return true
          if (t === 'referral' && entryType === 'referral_redeem') return true
          return false
        })
        if (!match) continue
      }

      let desc = ''
      switch (entryType) {
        case 'trial':          desc = `Тестовый период: ${meta?.days ?? '?'} дн.`; break
        case 'bonus_redeem':   desc = `Использование бонусных дней: ${meta?.days ?? '?'} дн.`; break
        case 'referral_redeem': desc = `Использование реферальных дней: ${meta?.days ?? '?'} дн.`; break
        case 'balance_purchase': desc = `Оплата с баланса: ${p.tariff?.name || 'Тариф'}`; break
        default: {
          const statusLabel = p.status === 'PAID' ? '' : p.status === 'PENDING' ? ' (ожидание)' : p.status === 'FAILED' ? ' (не оплачен)' : p.status === 'EXPIRED' ? ' (истёк)' : ` (${p.status})`
          desc = p.amount > 0 ? `Оплата: ${p.tariff?.name || 'Тариф'}${statusLabel}` : (p.tariff?.name || `Действие`)
          break
        }
      }

      entries.push({
        id:          p.id,
        type:        entryType,
        description: desc,
        amount:      Number(p.amount),
        date:        p.createdAt,
        metadata:    {
          status: p.status, provider: p.provider, purpose: p.purpose,
          tariff: p.tariff?.name ?? null,
          ...meta,
        },
      })
    }
  }

  // --- Promo activations ---
  const includePromo = !types || types.includes('promo')
  if (includePromo) {
    const promoUsages = await prisma.promoUsage.findMany({
      where:   { userId },
      include: { promo: { select: { code: true, type: true, description: true, discountPct: true, bonusDays: true, balanceAmount: true } } },
      orderBy: { usedAt: 'desc' },
    })
    for (const pu of promoUsages) {
      entries.push({
        id:          pu.id,
        type:        'promo',
        description: `Промокод ${pu.promo.code}: ${pu.promo.description || pu.promo.type}`,
        amount:      pu.promo.balanceAmount ? Number(pu.promo.balanceAmount) : null,
        date:        pu.usedAt,
        metadata:    {
          code:        pu.promo.code,
          promoType:   pu.promo.type,
          discountPct: pu.promo.discountPct,
          bonusDays:   pu.promo.bonusDays,
          balanceAmount: pu.promo.balanceAmount ? Number(pu.promo.balanceAmount) : null,
        },
      })
    }
  }

  // --- Balance transactions ---
  const includeBalance = !types || types.includes('balance')
  if (includeBalance) {
    const txns = await prisma.balanceTransaction.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    })
    for (const tx of txns) {
      // Skip PURCHASE transactions that are linked to a Payment —
      // those are already shown as 'balance_purchase' Payment entries (avoid duplication)
      if (tx.type === 'PURCHASE' && tx.paymentId) continue
      // Also skip TOPUP entries from YuKassa payments — the Payment entry already shows them
      if (tx.type === 'TOPUP' && tx.paymentId) continue

      entries.push({
        id:          tx.id,
        type:        'balance',
        description: tx.description || `Баланс: ${tx.type}`,
        amount:      Number(tx.amount),
        date:        tx.createdAt,
        metadata:    { balanceType: tx.type, paymentId: tx.paymentId },
      })
    }
  }

  // Sort all entries by date descending, then paginate
  entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  return entries.slice(skip, skip + take)
}
