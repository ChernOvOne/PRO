import type { FastifyInstance } from 'fastify'
import { z }        from 'zod'
import axios        from 'axios'
import { prisma }   from '../db'
import { remnawave } from '../services/remnawave'
import { balanceService } from '../services/balance'
import { inAppNotifications } from '../services/notification-service'
import { notifications } from '../services/notifications'
import { logger }   from '../utils/logger'
import { config }   from '../config'
import { parseYukassaStatus, buildActivityLog } from './users'

// GeoIP cache (in-memory, TTL 1 hour)
const geoCache = new Map<string, { data: any; ts: number }>()

async function getGeoInfo(ip: string | null): Promise<any> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.')) {
    return null
  }

  const cached = geoCache.get(ip)
  if (cached && Date.now() - cached.ts < 3600_000) return cached.data

  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,regionName,isp,query`, { timeout: 3000 })
    if (res.data?.status === 'success') {
      const geo = {
        ip:      res.data.query,
        country: res.data.country,
        city:    res.data.city,
        region:  res.data.regionName,
        isp:     res.data.isp,
      }
      geoCache.set(ip, { data: geo, ts: Date.now() })
      return geo
    }
  } catch {}
  return null
}

const TariffSchema = z.object({
  name:             z.string(),
  description:      z.string().optional().nullable(),
  countries:        z.string().optional().nullable(),
  protocol:         z.string().optional().nullable(),
  speed:            z.string().optional().nullable(),
  type:             z.enum(['SUBSCRIPTION', 'TRAFFIC_ADDON']).default('SUBSCRIPTION'),
  durationDays:     z.coerce.number().default(0),
  priceRub:         z.coerce.number(),
  priceUsdt:        z.coerce.number().optional().nullable(),
  deviceLimit:      z.coerce.number().default(3),
  trafficGb:        z.coerce.number().optional().nullable(),
  trafficAddonGb:   z.coerce.number().optional().nullable(),
  trafficStrategy:  z.string().default('MONTH'),
  isActive:         z.boolean().default(true),
  isVisible:        z.boolean().default(true),
  isFeatured:       z.boolean().default(false),
  isTrial:          z.boolean().default(false),
  sortOrder:        z.coerce.number().default(0),
  remnawaveSquads:  z.array(z.string()).default([]),
  remnawaveTag:     z.string().optional().nullable(),
  remnawaveTagIds:  z.array(z.string()).default([]),
  mode:             z.enum(['simple', 'variants', 'configurator']).default('simple'),
  variants:         z.any().optional().nullable(),
  configurator:     z.any().optional().nullable(),
})

const InstructionSchema = z.object({
  title:      z.string().min(1),
  deviceType: z.enum(['WINDOWS','MACOS','LINUX','IOS','ANDROID','ROUTER','OTHER']),
  content:    z.string().min(1),
  sortOrder:  z.number().int().default(0),
  isActive:   z.boolean().default(true),
})

export async function adminRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ─────────────────────────────────────────────────────────
  //  DASHBOARD STATS
  // ─────────────────────────────────────────────────────────
  app.get('/stats', admin, async () => {
    const [
      totalUsers, activeUsers, totalRevenue,
      todayRevenue, pendingPayments, rmStats,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subStatus: 'ACTIVE' } }),
      prisma.payment.aggregate({
        where:  { status: 'PAID' },
        _sum:   { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status:      'PAID',
          confirmedAt: { gte: new Date(new Date().setHours(0,0,0,0)) },
        },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      remnawave.getSystemStats().catch(() => null),
    ])

    // Revenue last 30 days by day
    const revChart = await prisma.$queryRaw<Array<{date: string, amount: number}>>`
      SELECT
        DATE_TRUNC('day', "confirmed_at")::date::text AS date,
        SUM(amount) AS amount
      FROM payments
      WHERE status = 'PAID'
        AND confirmed_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `

    return {
      totalUsers,
      activeUsers,
      totalRevenue:   totalRevenue._sum.amount ?? 0,
      todayRevenue:   todayRevenue._sum.amount ?? 0,
      pendingPayments,
      remnawave:      rmStats,
      revenueChart:   revChart,
    }
  })

  // ─────────────────────────────────────────────────────────
  //  TARIFFS
  // ─────────────────────────────────────────────────────────
  app.get('/tariffs', admin, async () =>
    prisma.tariff.findMany({ orderBy: { sortOrder: 'asc' } }),
  )

  app.post('/tariffs', admin, async (req, reply) => {
    const data = TariffSchema.parse(req.body)
    const tariff = await prisma.tariff.create({ data })
    return reply.status(201).send(tariff)
  })

  app.put('/tariffs/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data   = TariffSchema.partial().parse(req.body)
    const tariff = await prisma.tariff.update({ where: { id }, data })
    return tariff
  })

  app.patch('/tariffs/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data   = TariffSchema.partial().parse(req.body)
    const tariff = await prisma.tariff.update({ where: { id }, data })
    return tariff
  })

  app.delete('/tariffs/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.tariff.delete({ where: { id } })
    return { ok: true }
  })



  // ─────────────────────────────────────────────────────────
  //  INSTRUCTIONS
  // ─────────────────────────────────────────────────────────
  // Instructions are handled in /api/admin/instructions/* routes

  // ─────────────────────────────────────────────────────────
  //  USERS
  // ─────────────────────────────────────────────────────────
  app.get('/users', admin, async (req) => {
    const { page = '1', limit = '50', search = '', status = '', utm = '' } =
      req.query as Record<string, string>

    const skip = (Number(page) - 1) * Number(limit)
    const where: any = {}
    if (search) {
      where.OR = [
        { email:        { contains: search, mode: 'insensitive' } },
        { telegramName: { contains: search, mode: 'insensitive' } },
        { telegramId:   { contains: search } },
      ]
    }
    if (status) where.subStatus = status
    if (utm) where.customerSource = { contains: utm, mode: 'insensitive' }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take:    Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, telegramId: true, telegramName: true,
          subStatus: true, subExpireAt: true, role: true, isActive: true,
          createdAt: true, lastLoginAt: true, remnawaveUuid: true,
          referralCode: true, customerSource: true,
          _count: { select: { referrals: true, payments: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return { users, total, page: Number(page), limit: Number(limit) }
  })

  app.get('/users/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({
      where:   { id },
      include: {
        payments:     { orderBy: { createdAt: 'desc' }, take: 20 },
        bonusHistory: { orderBy: { appliedAt: 'desc' } },
        referrals:    { select: { id: true, email: true, telegramName: true } },
      },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const { passwordHash, ...safe } = user as any

    // Fetch REMNAWAVE data if linked
    let rmData: any = null
    if (user.remnawaveUuid) {
      try {
        const rm = await remnawave.getUserByUuid(user.remnawaveUuid)
        rmData = {
          username:           rm.username,
          status:             rm.status,
          expireAt:           rm.expireAt,
          trafficLimitBytes:  rm.trafficLimitBytes,
          trafficLimitStrategy: rm.trafficLimitStrategy,
          hwidDeviceLimit:    rm.hwidDeviceLimit,
          tag:                rm.tag,
          subscriptionUrl:    rm.subscriptionUrl,
          subLastUserAgent:   rm.subLastUserAgent,
          subLastOpenedAt:    rm.subLastOpenedAt,
          usedTrafficBytes:   rm.userTraffic?.usedTrafficBytes ?? 0,
          lifetimeUsedTrafficBytes: rm.userTraffic?.lifetimeUsedTrafficBytes ?? 0,
          onlineAt:           rm.userTraffic?.onlineAt,
          firstConnectedAt:   rm.userTraffic?.firstConnectedAt,
          lastConnectedNodeUuid: rm.userTraffic?.lastConnectedNodeUuid,
          activeInternalSquads: rm.activeInternalSquads,
        }
      } catch {
        // REMNAWAVE unavailable, continue without
      }
    }

    // GeoIP lookup for last IP
    const geoInfo = await getGeoInfo(user.lastIp).catch(() => null)

    return { ...safe, rmData, geoInfo }
  })

  // ── User activity log (admin view) ─────────────────────────
  app.get('/users/:id/activity', admin, async (req) => {
    const { id } = req.params as { id: string }
    const { type, page = '1', limit = '20' } = req.query as Record<string, string>
    const take = Math.min(Number(limit) || 20, 100)
    const skip = ((Number(page) || 1) - 1) * take

    const items = await buildActivityLog(id, type || null, skip, take)
    return { items, page: Number(page) || 1, limit: take, userId: id }
  })

  // Extend user subscription manually
  app.post('/users/:id/extend', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days, note } = req.body as { days: number; note?: string }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user?.remnawaveUuid) {
      return reply.status(400).send({ error: 'User has no REMNAWAVE subscription' })
    }

    const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
    const updated = await remnawave.extendSubscription(
      user.remnawaveUuid, days,
      rmUser.expireAt ? new Date(rmUser.expireAt) : null,
    )

    await prisma.user.update({
      where: { id },
      data: {
        subExpireAt: updated.expireAt ? new Date(updated.expireAt) : null,
        subStatus:   'ACTIVE',
      },
    })

    // Log manual payment
    await prisma.payment.create({
      data: {
        userId:   id,
        tariffId: (await prisma.tariff.findFirst({ orderBy: { createdAt: 'asc' } }))!.id,
        provider: 'MANUAL',
        amount:   0,
        currency: 'RUB',
        status:   'PAID',
        confirmedAt: new Date(),
      },
    })

    logger.info(`Admin extended ${id} by ${days} days. Note: ${note}`)
    return { ok: true, newExpireAt: updated.expireAt }
  })

  // Toggle user active status
  app.post('/users/:id/toggle', admin, async (req) => {
    const { id }     = req.params as { id: string }
    const user       = await prisma.user.findUniqueOrThrow({ where: { id } })
    const newActive  = !user.isActive

    await prisma.user.update({ where: { id }, data: { isActive: newActive } })

    if (user.remnawaveUuid) {
      newActive
        ? await remnawave.enableUser(user.remnawaveUuid)
        : await remnawave.disableUser(user.remnawaveUuid)
    }

    return { ok: true, isActive: newActive }
  })

  // ─────────────────────────────────────────────────────────
  //  UPDATE USER PROFILE (email, telegram_id)
  // ─────────────────────────────────────────────────────────
  app.patch('/users/:id/profile', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      email:      z.string().email().nullable().optional(),
      telegramId: z.string().nullable().optional(),
    }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Check if email/telegramId is taken by another user
    if (body.email && body.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: body.email } })
      if (existing && existing.id !== id) return reply.status(409).send({ error: 'Email уже занят' })
    }
    if (body.telegramId && body.telegramId !== user.telegramId) {
      const existing = await prisma.user.findUnique({ where: { telegramId: body.telegramId } })
      if (existing && existing.id !== id) return reply.status(409).send({ error: 'Telegram ID уже занят' })
    }

    // Update local user
    const updateData: any = {}
    if (body.email !== undefined) updateData.email = body.email || null
    if (body.telegramId !== undefined) updateData.telegramId = body.telegramId || null

    const updated = await prisma.user.update({ where: { id }, data: updateData })

    // Sync to REMNAWAVE
    if (user.remnawaveUuid) {
      try {
        await remnawave.updateUser({
          uuid: user.remnawaveUuid,
          email: updated.email ?? undefined,
          telegramId: updated.telegramId ? parseInt(updated.telegramId, 10) : undefined,
        } as any)
      } catch (err) {
        logger.warn(`REMNAWAVE sync failed for user ${id}: ${(err as any).message}`)
      }
    }

    logger.info(`Admin updated profile for user ${id}: email=${updated.email}, tg=${updated.telegramId}`)
    return { ok: true, user: { id: updated.id, email: updated.email, telegramId: updated.telegramId } }
  })

  // ─────────────────────────────────────────────────────────
  //  PAYMENTS
  // ─────────────────────────────────────────────────────────
  app.get('/payments', admin, async (req) => {
    const {
      page = '1', limit = '50', status = '', provider = '',
      search = '', userId = '', dateFrom = '', dateTo = '',
      purpose = '', type: paymentType = '',
    } = req.query as Record<string, string>

    const skip  = (Number(page) - 1) * Number(limit)
    const where: any = {}
    if (status)   where.status   = status
    if (provider) where.provider = provider
    if (userId)   where.userId   = userId
    if (purpose)  where.purpose  = purpose

    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo)   where.createdAt.lte = new Date(dateTo)
    }

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { telegramName: { contains: search, mode: 'insensitive' } } },
        { user: { telegramId: { contains: search } } },
      ]
    }

    // For special type filters (bonus_redeem, referral_redeem, promo_discount, real_payment)
    // we need to filter via yukassaStatus JSON content
    if (paymentType === 'bonus_redeem') {
      where.yukassaStatus = { contains: '"_type":"bonus_redeem"' }
    } else if (paymentType === 'referral_redeem') {
      where.yukassaStatus = { contains: '"_type":"referral_redeem"' }
    } else if (paymentType === 'promo_discount') {
      where.yukassaStatus = { contains: '"promoCode"' }
    } else if (paymentType === 'real_payment' && !provider) {
      // Real payments: provider is YUKASSA or CRYPTOPAY (not BALANCE/MANUAL)
      where.provider = { in: ['YUKASSA', 'CRYPTOPAY'] }
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take:    Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user:   { select: { id: true, email: true, telegramName: true, telegramId: true, customerSource: true } },
          tariff: { select: { name: true } },
        },
      }),
      prisma.payment.count({ where }),
    ])

    const enriched = payments.map(p => ({
      ...p,
      parsedMeta: parseYukassaStatus(p.yukassaStatus),
    }))

    return { payments: enriched, total }
  })

  // ─────────────────────────────────────────────────────────
  //  ADMIN MANAGEMENT
  // ─────────────────────────────────────────────────────────

  // List admins
  app.get('/admins', admin, async () => {
    return prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, email: true, telegramId: true, telegramName: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  // Invite admin by email
  app.post('/admins/invite-email', admin, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)

    let user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      // Existing user → promote to admin
      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
    } else {
      // Create new user with temp password
      const bcrypt = await import('bcryptjs')
      const tempPw = Math.random().toString(36).slice(2, 10)
      const hash = await bcrypt.hash(tempPw, 12)
      user = await prisma.user.create({
        data: { email, passwordHash: hash, role: 'ADMIN', emailVerified: true },
      })
    }

    // Send invitation email
    const { emailService } = await import('../services/email')
    await emailService.send({
      to: email,
      subject: 'Вы приглашены как администратор — HIDEYOU VPN',
      html: `<h2>Приглашение в администраторы</h2>
        <p>Вас пригласили в панель администратора <strong>HIDEYOU VPN</strong>.</p>
        <p>Войдите по ссылке и установите пароль через "Сбросить пароль":</p>
        <a href="${config.appUrl}/login" style="display:inline-block;padding:12px 24px;background:#5569ff;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;margin-top:12px;">Войти в панель</a>`,
    }).catch(() => {})

    logger.info(`Admin invited by email: ${email}`)
    return { ok: true, userId: user.id }
  })

  // Invite admin by Telegram ID
  app.post('/admins/invite-telegram', admin, async (req, reply) => {
    const { telegramId } = z.object({ telegramId: z.string().min(1) }).parse(req.body)

    let user = await prisma.user.findUnique({ where: { telegramId } })
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
    } else {
      user = await prisma.user.create({
        data: { telegramId, role: 'ADMIN' },
      })
    }

    // Notify via bot
    try {
      const { bot } = await import('../bot')
      await bot.api.sendMessage(telegramId, '🔑 Вы назначены *администратором* HIDEYOU VPN.', { parse_mode: 'Markdown' })
    } catch {}

    logger.info(`Admin invited by TG: ${telegramId}`)
    return { ok: true, userId: user.id }
  })

  // Remove admin role
  app.post('/admins/:id/revoke', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const adminId = (req.user as any).sub
    if (id === adminId) return reply.status(400).send({ error: 'Нельзя снять админа с себя' })

    await prisma.user.update({ where: { id }, data: { role: 'USER' } })
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  SETTINGS
  // ─────────────────────────────────────────────────────────
  app.get('/settings', admin, async () => {
    const settings = await prisma.setting.findMany()
    return Object.fromEntries(settings.map(s => [s.key, s.value]))
  })

  app.put('/settings', admin, async (req) => {
    const updates = req.body as Record<string, string>
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.setting.upsert({
          where:  { key },
          create: { key, value },
          update: { value },
        }),
      ),
    )
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  IMPORT STATUS
  // ─────────────────────────────────────────────────────────
  app.get('/import', admin, async () => {
    const [total, matched, pending] = await Promise.all([
      prisma.importRecord.count(),
      prisma.importRecord.count({ where: { status: 'matched' } }),
      prisma.importRecord.count({ where: { status: 'pending' } }),
    ])
    return { total, matched, pending, unmatched: total - matched }
  })

  // ── Internal Squads (от Remnawave) ─────────────────────────
  app.get('/squads', admin, async (_, reply) => {
    try {
      const result = await remnawave.getInternalSquads()
      return result
    } catch {
      return reply.status(502).send({ error: 'Failed to load squads from Remnawave' })
    }
  })

  // ─────────────────────────────────────────────────────────
  //  USER ACTIONS
  // ─────────────────────────────────────────────────────────

  // Revoke subscription (reset shortUuid in REMNAWAVE)
  app.post('/users/:id/revoke', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user?.remnawaveUuid) return reply.status(400).send({ error: 'No REMNAWAVE subscription' })

    const rmUser = await remnawave.revokeSubscription(user.remnawaveUuid)
    await prisma.user.update({
      where: { id },
      data:  { subLink: remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl) },
    })

    logger.info(`Admin revoked subscription for user ${id}`)
    return { ok: true }
  })

  // Disable user
  app.post('/users/:id/disable', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    await prisma.user.update({ where: { id }, data: { isActive: false } })
    if (user.remnawaveUuid) {
      await remnawave.disableUserAction(user.remnawaveUuid)
    }

    logger.info(`Admin disabled user ${id}`)
    return { ok: true, isActive: false }
  })

  // Enable user
  app.post('/users/:id/enable', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    await prisma.user.update({ where: { id }, data: { isActive: true } })
    if (user.remnawaveUuid) {
      await remnawave.enableUser(user.remnawaveUuid)
    }

    logger.info(`Admin enabled user ${id}`)
    return { ok: true, isActive: true }
  })

  // Reset traffic
  app.post('/users/:id/reset-traffic', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user?.remnawaveUuid) return reply.status(400).send({ error: 'No REMNAWAVE subscription' })

    await remnawave.resetTrafficAction(user.remnawaveUuid)
    logger.info(`Admin reset traffic for user ${id}`)
    return { ok: true }
  })

  // Delete user completely
  app.delete('/users/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Delete from REMNAWAVE if linked
    if (user.remnawaveUuid) {
      await remnawave.deleteUser(user.remnawaveUuid).catch(err =>
        logger.warn(`Failed to delete REMNAWAVE user: ${err.message}`)
      )
    }

    // Delete all related records that don't have CASCADE
    await prisma.referralBonus.deleteMany({ where: { referrerId: id } })
    await prisma.giftSubscription.deleteMany({ where: { OR: [{ fromUserId: id }, { recipientUserId: id }] } })
    await prisma.promoUsage.deleteMany({ where: { userId: id } })
    await prisma.botMessage.deleteMany({ where: { userId: id } })
    await prisma.balanceTransaction.deleteMany({ where: { userId: id } })
    await prisma.payment.deleteMany({ where: { userId: id } })
    // Unset referredById on users who were referred by this user
    await prisma.user.updateMany({ where: { referredById: id }, data: { referredById: null } })

    // Delete user (cascade handles sessions, notes, notifications, etc.)
    await prisma.user.delete({ where: { id } })

    logger.info(`Admin deleted user ${id}`)
    return { ok: true }
  })

  // ── Partial delete: REMNAWAVE only ──
  app.post('/users/:id/delete-remnawave', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (!user.remnawaveUuid) return reply.status(400).send({ error: 'Нет подписки REMNAWAVE' })

    await remnawave.deleteUser(user.remnawaveUuid).catch(err =>
      logger.warn(`Failed to delete REMNAWAVE user: ${err.message}`)
    )
    await prisma.user.update({
      where: { id },
      data: { remnawaveUuid: null, subStatus: 'INACTIVE', subExpireAt: null, subLink: null },
    })
    logger.info(`Admin deleted REMNAWAVE subscription for user ${id}`)
    return { ok: true }
  })

  // ── Partial delete: web account only (keep REMNAWAVE) ──
  app.post('/users/:id/delete-web', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Delete all DB records but don't touch REMNAWAVE
    await prisma.referralBonus.deleteMany({ where: { referrerId: id } })
    await prisma.giftSubscription.deleteMany({ where: { OR: [{ fromUserId: id }, { recipientUserId: id }] } })
    await prisma.promoUsage.deleteMany({ where: { userId: id } })
    await prisma.botMessage.deleteMany({ where: { userId: id } })
    await prisma.balanceTransaction.deleteMany({ where: { userId: id } })
    await prisma.payment.deleteMany({ where: { userId: id } })
    await prisma.user.updateMany({ where: { referredById: id }, data: { referredById: null } })
    await prisma.user.delete({ where: { id } })

    logger.info(`Admin deleted web account for user ${id} (REMNAWAVE kept)`)
    return { ok: true }
  })

  // ── Partial delete: remove from bot (unlink TG + clear history) ──
  app.post('/users/:id/delete-bot', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    await prisma.botMessage.deleteMany({ where: { userId: id } })
    await prisma.user.update({
      where: { id },
      data: { telegramId: null, telegramName: null },
    })
    logger.info(`Admin removed user ${id} from bot (TG unlinked + history cleared)`)
    return { ok: true }
  })

  // Send notification to user
  app.post('/users/:id/notify', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { title, message, type } = z.object({
      title:   z.string().min(1),
      message: z.string().min(1),
      type:    z.enum(['INFO', 'WARNING', 'SUCCESS', 'PROMO']).optional(),
    }).parse(req.body)

    await inAppNotifications.sendToUser({ userId: id, title, message, type })
    await notifications.sendCustom(id, title, message).catch(() => {})

    return { ok: true }
  })

  // Add days to subscription
  app.post('/users/:id/add-days', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days, note } = z.object({
      days: z.coerce.number().min(1),
      note: z.string().optional(),
    }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user?.remnawaveUuid) return reply.status(400).send({ error: 'No REMNAWAVE subscription' })

    const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
    const updated = await remnawave.extendSubscription(
      user.remnawaveUuid, days,
      rmUser.expireAt ? new Date(rmUser.expireAt) : null,
    )

    await prisma.user.update({
      where: { id },
      data: {
        subExpireAt: updated.expireAt ? new Date(updated.expireAt) : null,
        subStatus:   'ACTIVE',
      },
    })

    logger.info(`Admin added ${days} days to user ${id}. Note: ${note || 'none'}`)
    return { ok: true, newExpireAt: updated.expireAt }
  })

  // Adjust user balance
  app.post('/users/:id/adjust-balance', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { amount, description } = z.object({
      amount:      z.coerce.number(),
      description: z.string().optional(),
    }).parse(req.body)

    const result = await balanceService.adminAdjust({ userId: id, amount, description })
    return { ok: true, newBalance: Number(result.newBalance) }
  })

  // Grant bonus days to a user
  app.post('/users/:id/grant-days', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days, description } = z.object({
      days: z.coerce.number().min(1),
      description: z.string().optional(),
    }).parse(req.body)

    const user = await prisma.user.update({
      where: { id },
      data: { bonusDays: { increment: days } },
    })

    // Log it as admin note
    const adminId = (req.user as any).sub
    await prisma.adminNote.create({
      data: { userId: id, adminId, text: `Начислено ${days} бонусных дней${description ? ': ' + description : ''}` }
    })

    // Record in balance history so user sees it in activity
    await prisma.balanceTransaction.create({
      data: {
        userId: id,
        amount: days,
        type: 'GIFT',
        description: `Начислено ${days} бонусных дней`,
      },
    })

    logger.info(`Admin granted ${days} bonus days to user ${id}`)
    return { ok: true, newBonusDays: user.bonusDays }
  })

  // Grant bonus days to ALL users
  app.post('/grant-days-all', admin, async (req, reply) => {
    const { days, description } = z.object({
      days: z.coerce.number().min(1),
      description: z.string().optional(),
    }).parse(req.body)

    const result = await prisma.user.updateMany({
      where: { isActive: true },
      data: { bonusDays: { increment: days } },
    })

    logger.info(`Admin granted ${days} bonus days to all users (${result.count} users)`)
    return { ok: true, updatedCount: result.count }
  })

  // ─────────────────────────────────────────────────────────
  //  ADMIN NOTES
  // ─────────────────────────────────────────────────────────
  app.get('/users/:id/notes', admin, async (req) => {
    const { id } = req.params as { id: string }
    return prisma.adminNote.findMany({
      where:   { userId: id },
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { email: true, telegramName: true } } },
    })
  })

  app.post('/users/:id/notes', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const adminId = (req.user as any).sub
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body)

    const note = await prisma.adminNote.create({
      data: { userId: id, adminId, text },
    })
    return reply.status(201).send(note)
  })

  app.delete('/users/:id/notes/:noteId', admin, async (req) => {
    const { noteId } = req.params as { noteId: string }
    await prisma.adminNote.delete({ where: { id: noteId } })
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  ANALYTICS
  // ─────────────────────────────────────────────────────────
  app.get('/analytics/health', admin, async () => {
    const health = await remnawave.getSystemHealth()
    return { remnawave: health }
  })

  app.get('/analytics/nodes', admin, async () => {
    const metrics = await remnawave.getNodesMetrics()
    return metrics || { nodes: [] }
  })

  // ─────────────────────────────────────────────────────────
  //  USER DEVICES (HWID)
  // ─────────────────────────────────────────────────────────

  // Get devices for a specific user by their DB id
  app.get('/users/:id/devices', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id }, select: { remnawaveUuid: true } })
    if (!user?.remnawaveUuid) return reply.status(400).send({ error: 'No REMNAWAVE subscription' })

    try {
      const result = await remnawave.getDevices(user.remnawaveUuid)
      return result
    } catch {
      return reply.status(502).send({ error: 'Failed to load devices' })
    }
  })

  // Delete device for a specific user
  app.post('/users/:id/devices/delete', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { hwid } = req.body as { hwid: string }
    if (!hwid) return reply.status(400).send({ error: 'hwid required' })

    const user = await prisma.user.findUnique({ where: { id }, select: { remnawaveUuid: true } })
    if (!user?.remnawaveUuid) return reply.status(400).send({ error: 'No REMNAWAVE subscription' })

    try {
      await remnawave.deleteDevice(user.remnawaveUuid, hwid)
      logger.info(`Admin deleted device ${hwid} from user ${id}`)
      return { ok: true }
    } catch {
      return reply.status(502).send({ error: 'Failed to delete device' })
    }
  })

  // ─────────────────────────────────────────────────────────
  //  EXPORT USERS
  // ─────────────────────────────────────────────────────────
  app.get('/export/users', admin, async (req, reply) => {
    const { format = 'json' } = req.query as { format?: string }

    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, telegramId: true, telegramName: true,
        remnawaveUuid: true, subStatus: true, subExpireAt: true,
        role: true, isActive: true, createdAt: true, lastLoginAt: true,
        referralCode: true, balance: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (format === 'csv') {
      const header = 'id,email,telegramId,telegramName,remnawaveUuid,subStatus,subExpireAt,role,isActive,createdAt,balance\n'
      const rows = users.map(u =>
        `${u.id},${u.email || ''},${u.telegramId || ''},${u.telegramName || ''},${u.remnawaveUuid || ''},${u.subStatus},${u.subExpireAt || ''},${u.role},${u.isActive},${u.createdAt},${u.balance}`
      ).join('\n')

      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', 'attachment; filename=users.csv')
        .send(header + rows)
    }

    return { users, total: users.length }
  })
}
