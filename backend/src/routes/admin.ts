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
import { logAudit } from '../services/audit'
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
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,regionName,isp,lat,lon,query`, { timeout: 3000 })
    if (res.data?.status === 'success') {
      const geo = {
        ip:      res.data.query,
        country: res.data.country,
        city:    res.data.city,
        region:  res.data.regionName,
        isp:     res.data.isp,
        lat:     res.data.lat,
        lon:     res.data.lon,
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

// ─────────────────────────────────────────────────────────
//  Shared: build Prisma where clause for /users listing
//  Used by /users, /segments/:id/count and /segments/:id/users
// ─────────────────────────────────────────────────────────
export async function buildUsersWhere(q: Record<string, any>): Promise<any> {
  const where: any = {}
  const search: string = q.search || ''
  if (search) {
    where.OR = [
      { email:        { contains: search, mode: 'insensitive' } },
      { telegramName: { contains: search, mode: 'insensitive' } },
      { telegramId:   { contains: search } },
    ]
  }
  if (q.status) where.subStatus = q.status
  if (q.utm) where.customerSource = { contains: q.utm, mode: 'insensitive' }
  if (q.is_active === 'yes') where.isActive = true
  if (q.is_active === 'no') where.isActive = false
  if (q.role) where.role = q.role
  if (q.has_email === 'yes') where.email = { not: null }
  if (q.has_email === 'no') where.email = null
  if (q.has_telegram === 'yes') where.telegramId = { not: null }
  if (q.has_telegram === 'no') where.telegramId = null
  if (q.has_leadteh === 'yes') where.leadtehId = { not: null }
  if (q.has_leadteh === 'no') where.leadtehId = null

  // Payments filter
  if (q.has_payments === 'yes') where.paymentsCount = { gt: 0 }
  if (q.has_payments === 'no') where.paymentsCount = 0
  if (q.payments_min) where.paymentsCount = { ...(where.paymentsCount || {}), gte: Number(q.payments_min) }
  if (q.payments_max) where.paymentsCount = { ...(where.paymentsCount || {}), lte: Number(q.payments_max) }

  if (q.paid_min) where.totalPaid = { ...(where.totalPaid || {}), gte: Number(q.paid_min) }
  if (q.paid_max) where.totalPaid = { ...(where.totalPaid || {}), lte: Number(q.paid_max) }

  // Referrals (count-based)
  if (q.has_referrals === 'yes') where.referrals = { some: {} }
  if (q.has_referrals === 'no') where.referrals = { none: {} }

  // referrals_min — N+ referrals in total (paid + unpaid)
  if (q.referrals_min) {
    const min = Number(q.referrals_min)
    if (!Number.isNaN(min) && min > 0) {
      const grouped = await prisma.user.groupBy({
        by: ['referredById'],
        where: { referredById: { not: null } },
        _count: { _all: true },
      })
      const qualifyingIds = grouped
        .filter(g => g._count._all >= min)
        .map(g => g.referredById!)
        .filter(Boolean)
      if (qualifyingIds.length === 0) {
        where.id = { in: ['__none__'] }
      } else if (where.id && typeof where.id === 'object' && 'in' in where.id) {
        // Intersect with existing id filter
        const existing = (where.id as any).in as string[]
        where.id = { in: existing.filter(i => qualifyingIds.includes(i)) }
      } else {
        where.id = { in: qualifyingIds }
      }
    }
  }

  // Date ranges
  if (q.created_from || q.created_to) {
    where.createdAt = {}
    if (q.created_from) where.createdAt.gte = new Date(q.created_from)
    if (q.created_to) where.createdAt.lte = new Date(q.created_to)
  }

  if (q.expires_from || q.expires_to) {
    where.subExpireAt = {}
    if (q.expires_from) where.subExpireAt.gte = new Date(q.expires_from)
    if (q.expires_to) where.subExpireAt.lte = new Date(q.expires_to)
  }

  // Last login days - combines with search OR if already set
  if (q.last_login_days) {
    const days = Number(q.last_login_days)
    const threshold = new Date(Date.now() - days * 86400000)
    const lastLoginCond = [
      { lastLoginAt: null },
      { lastLoginAt: { lt: threshold } },
    ]
    if (where.OR) {
      const existingOr = where.OR
      delete where.OR
      where.AND = [
        { OR: existingOr },
        { OR: lastLoginCond },
      ]
    } else {
      where.OR = lastLoginCond
    }
  }

  // Campaign filter: find utmCode by campaignId
  if (q.campaignId) {
    const camp = await prisma.buhAdCampaign.findUnique({ where: { id: q.campaignId } })
    if (camp?.utmCode) {
      where.customerSource = camp.utmCode
    }
  }

  // ── Extended filters ─────────────────────────────────────
  // search_id: точный/частичный поиск по id / telegramId / leadtehId
  if (q.search_id) {
    const sid = String(q.search_id).trim()
    const sidOr = [
      { id: sid },
      { telegramId: sid },
      { leadtehId: sid },
      { id: { contains: sid, mode: 'insensitive' as const } },
    ]
    if (where.OR) {
      const existingOr = where.OR
      delete where.OR
      where.AND = [...(where.AND || []), { OR: existingOr }, { OR: sidOr }]
    } else {
      where.OR = sidOr
    }
  }

  // expires_in_days — истекает в ближайшие N дней
  if (q.expires_in_days) {
    const days = Number(q.expires_in_days)
    const now = new Date()
    const future = new Date(Date.now() + days * 86400000)
    where.subExpireAt = { ...(where.subExpireAt || {}), gte: now, lte: future }
  }

  // expired_days_ago — истекло ровно N дней назад (±1 день)
  if (q.expired_days_ago) {
    const days = Number(q.expired_days_ago)
    const from = new Date(Date.now() - (days + 1) * 86400000)
    const to = new Date(Date.now() - days * 86400000)
    where.subExpireAt = { ...(where.subExpireAt || {}), gte: from, lte: to }
  }

  // trial_used — использовал ли триал
  if (q.trial_used === 'yes') {
    where.AND = [...(where.AND || []), { OR: [{ subStatus: 'TRIAL' }, { paymentsCount: { gt: 0 } }] }]
  }
  if (q.trial_used === 'no') {
    where.AND = [...(where.AND || []), { subStatus: { not: 'TRIAL' } }, { paymentsCount: 0 }]
  }

  // balance range
  if (q.balance_min || q.balance_max) {
    where.balance = where.balance || {}
    if (q.balance_min) where.balance.gte = Number(q.balance_min)
    if (q.balance_max) where.balance.lte = Number(q.balance_max)
  }

  // bonus days range
  if (q.bonus_days_min || q.bonus_days_max) {
    where.bonusDays = where.bonusDays || {}
    if (q.bonus_days_min) where.bonusDays.gte = Number(q.bonus_days_min)
    if (q.bonus_days_max) where.bonusDays.lte = Number(q.bonus_days_max)
  }

  // paid_recent_days — давно не платил
  if (q.paid_recent_days) {
    const days = Number(q.paid_recent_days)
    const threshold = new Date(Date.now() - days * 86400000)
    where.AND = [
      ...(where.AND || []),
      { OR: [{ lastPaymentAt: null }, { lastPaymentAt: { lt: threshold } }] },
    ]
  }

  // no_utm — органика
  if (q.no_utm === 'yes') {
    where.customerSource = null
  }

  // utm_without_campaign — есть source, но нет соответствующей кампании
  if (q.utm_without_campaign === 'yes') {
    const camps = await prisma.buhAdCampaign.findMany({ select: { utmCode: true } })
    const codes = camps.map(c => c.utmCode).filter(Boolean) as string[]
    where.customerSource = { not: null, notIn: codes }
  }

  // has_referrer
  if (q.has_referrer === 'yes') where.referredById = { not: null }
  if (q.has_referrer === 'no') where.referredById = null

  // referrer_id — все, кого пригласил указанный пользователь
  if (q.referrer_id) where.referredById = q.referrer_id

  // referrals_paid_min — пользователи, у которых ≥ N оплативших рефералов
  if (q.referrals_paid_min) {
    const minPaid = Number(q.referrals_paid_min)
    where.referrals = { ...(where.referrals || {}), some: { paymentsCount: { gt: 0 } } }
    // exact "≥ N" filter handled in-memory after fetch (см. ниже)
    ;(where as any).__refsPaidMin = minPaid
  }

  // registered_days_ago — годовщина (±1 день)
  if (q.registered_days_ago) {
    const days = Number(q.registered_days_ago)
    const from = new Date(Date.now() - (days + 1) * 86400000)
    const to = new Date(Date.now() - Math.max(days - 1, 0) * 86400000)
    where.createdAt = { ...(where.createdAt || {}), gte: from, lte: to }
  }

  // registered_within_days — за последние N дней
  if (q.registered_within_days) {
    const days = Number(q.registered_within_days)
    where.createdAt = { ...(where.createdAt || {}), gte: new Date(Date.now() - days * 86400000) }
  }

  // active_within_days — заходил в ЛК за последние N дней
  if (q.active_within_days) {
    const days = Number(q.active_within_days)
    where.lastLoginAt = { ...(where.lastLoginAt || {}), gte: new Date(Date.now() - days * 86400000) }
  }

  // country / city — JSON path filters on geoInfo
  if (q.country) {
    where.geoInfo = { path: ['country'], equals: q.country }
  }
  if (q.city) {
    where.geoInfo = { path: ['city'], string_contains: q.city }
  }

  return where
}

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
    const q = req.query as {
      page?: string
      limit?: string
      search?: string
      status?: string
      utm?: string
      campaignId?: string
      has_payments?: string
      payments_min?: string
      payments_max?: string
      paid_min?: string
      paid_max?: string
      has_referrals?: string
      referrals_min?: string
      created_from?: string
      created_to?: string
      expires_from?: string
      expires_to?: string
      last_login_days?: string
      is_active?: string
      role?: string
      has_email?: string
      has_telegram?: string
      has_leadteh?: string
      sort?: string
      // Extended filters
      search_id?: string
      expires_in_days?: string
      expired_days_ago?: string
      trial_used?: string
      balance_min?: string
      balance_max?: string
      bonus_days_min?: string
      bonus_days_max?: string
      avg_check_min?: string
      avg_check_max?: string
      paid_recent_days?: string
      utm_without_campaign?: string
      no_utm?: string
      has_referrer?: string
      referrer_id?: string
      referrals_paid_min?: string
      registered_days_ago?: string
      registered_within_days?: string
      active_within_days?: string
      country?: string
      city?: string
    }

    const page = q.page || '1'
    const limit = q.limit || '50'
    const search = q.search || ''

    const skip = (Number(page) - 1) * Number(limit)
    const where = await buildUsersWhere(q as Record<string, any>)

    // Strip in-memory hint flag before passing to Prisma
    const refsPaidMin: number | null = (where as any).__refsPaidMin ?? null
    if (refsPaidMin !== null) delete (where as any).__refsPaidMin

    let orderBy: any = { createdAt: 'desc' }
    if (q.sort === 'created_asc')      orderBy = { createdAt: 'asc' }
    if (q.sort === 'created_desc')     orderBy = { createdAt: 'desc' }
    if (q.sort === 'paid_desc')        orderBy = { totalPaid: 'desc' }
    if (q.sort === 'paid_asc')         orderBy = { totalPaid: 'asc' }
    if (q.sort === 'payments_desc')    orderBy = { paymentsCount: 'desc' }
    if (q.sort === 'payments_asc')     orderBy = { paymentsCount: 'asc' }
    if (q.sort === 'last_login_desc')  orderBy = { lastLoginAt: 'desc' }
    if (q.sort === 'last_login_asc')   orderBy = { lastLoginAt: 'asc' }
    if (q.sort === 'expires_desc')     orderBy = { subExpireAt: 'desc' }
    if (q.sort === 'expires_asc')      orderBy = { subExpireAt: 'asc' }
    if (q.sort === 'status_asc')       orderBy = { subStatus: 'asc' }
    if (q.sort === 'status_desc')      orderBy = { subStatus: 'desc' }
    if (q.sort === 'source_asc')       orderBy = { customerSource: 'asc' }
    if (q.sort === 'source_desc')      orderBy = { customerSource: 'desc' }
    if (q.sort === 'email_asc')        orderBy = { email: 'asc' }
    if (q.sort === 'email_desc')       orderBy = { email: 'desc' }
    if (q.sort === 'refs_desc')        orderBy = { referrals: { _count: 'desc' } }
    if (q.sort === 'refs_asc')         orderBy = { referrals: { _count: 'asc' } }

    // If we need to apply post-filters in memory (avg_check / refs_paid_min),
    // fetch a wider window and slice client-side. Otherwise normal pagination.
    const needsPostFilter = !!(q.avg_check_min || q.avg_check_max || refsPaidMin !== null)

    const baseSelect = {
      id: true, email: true, telegramId: true, telegramName: true,
      subStatus: true, subExpireAt: true, role: true, isActive: true,
      createdAt: true, lastLoginAt: true, remnawaveUuid: true,
      referralCode: true, customerSource: true,
      totalPaid: true, paymentsCount: true, lastPaymentAt: true, leadtehId: true,
      balance: true, bonusDays: true, lastIp: true, geoInfo: true,
      referredById: true,
      _count: { select: { referrals: true, payments: true } },
    } as const

    let users: any[]
    let total: number

    if (needsPostFilter) {
      // Fetch up to a reasonable cap, filter, then paginate
      const all = await prisma.user.findMany({
        where, orderBy, select: baseSelect, take: 5000,
      })
      let filtered = all
      if (q.avg_check_min || q.avg_check_max) {
        const min = Number(q.avg_check_min || 0)
        const max = Number(q.avg_check_max || Infinity)
        filtered = filtered.filter(u => {
          const avg = u.paymentsCount > 0 ? Number(u.totalPaid) / u.paymentsCount : 0
          return avg >= min && avg <= max
        })
      }
      if (refsPaidMin !== null) {
        // _count.referrals is total; we need a per-row count of paid refs.
        // Fetch paid referral counts for these candidate users in one query.
        const ids = filtered.map(u => u.id)
        const grouped = await prisma.user.groupBy({
          by: ['referredById'],
          where: { referredById: { in: ids }, paymentsCount: { gt: 0 } },
          _count: { _all: true },
        })
        const paidMap = new Map<string, number>()
        for (const g of grouped) if (g.referredById) paidMap.set(g.referredById, g._count._all)
        filtered = filtered.filter(u => (paidMap.get(u.id) || 0) >= refsPaidMin)
      }
      total = filtered.length
      users = filtered.slice(skip, skip + Number(limit))
    } else {
      const [u, t] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take:    Number(limit),
          orderBy,
          select: baseSelect,
        }),
        prisma.user.count({ where }),
      ])
      users = u
      total = t
    }

    return { users, total, page: Number(page), limit: Number(limit) }
  })

  // ── Geo stats: aggregated city counts for the map ────────
  app.get('/users/geo-stats', admin, async () => {
    const users = await prisma.user.findMany({
      where: { geoInfo: { not: null } as any } as any,
      select: { id: true, geoInfo: true },
    })

    const cityMap: Record<string, { city: string; country: string; lat: number; lon: number; count: number }> = {}
    for (const u of users) {
      const g = (u as any).geoInfo as any
      if (!g || !g.city || typeof g.lat !== 'number' || typeof g.lon !== 'number') continue
      const key = `${g.country || ''}__${g.city}`
      if (!cityMap[key]) {
        cityMap[key] = { city: g.city, country: g.country || '', lat: g.lat, lon: g.lon, count: 0 }
      }
      cityMap[key].count += 1
    }

    return {
      cities: Object.values(cityMap).sort((a, b) => b.count - a.count),
      total:  users.length,
    }
  })

  // ── Unique countries list (for filter dropdown) ──────────
  app.get('/users/countries', admin, async () => {
    const users = await prisma.user.findMany({
      where: { geoInfo: { not: null } as any } as any,
      select: { geoInfo: true },
    })
    const countries = new Set<string>()
    for (const u of users) {
      const g = (u as any).geoInfo as any
      if (g?.country) countries.add(g.country)
    }
    return Array.from(countries).sort()
  })

  app.get('/users/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({
      where:   { id },
      include: {
        payments:     { orderBy: { createdAt: 'desc' }, take: 20 },
        bonusHistory: { orderBy: { appliedAt: 'desc' } },
      },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // Lightweight referral counts (do not load full list here)
    const [totalReferrals, paidReferrals] = await Promise.all([
      prisma.user.count({ where: { referredById: id } }),
      prisma.user.count({ where: { referredById: id, paymentsCount: { gt: 0 } } }),
    ])

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

        // Lazy sync: refresh local subStatus / subExpireAt / subLink from REMNAWAVE.
        // This keeps the admin page accurate without waiting for hourly sync.
        const newStatus = rm.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
        const newExpire = rm.expireAt ? new Date(rm.expireAt) : null
        const newSubLink = remnawave.getSubscriptionUrl(rm.uuid, rm.subscriptionUrl)
        const statusChanged  = newStatus !== user.subStatus
        const expireChanged  = newExpire?.toISOString() !== user.subExpireAt?.toISOString()
        const subLinkChanged = newSubLink !== user.subLink
        if (statusChanged || expireChanged || subLinkChanged) {
          await prisma.user.update({
            where: { id: user.id },
            data:  { subStatus: newStatus, subExpireAt: newExpire, subLink: newSubLink },
          }).catch(() => {})
          ;(safe as any).subStatus   = newStatus
          ;(safe as any).subExpireAt = newExpire
          ;(safe as any).subLink     = newSubLink
        }
      } catch {
        // REMNAWAVE unavailable, continue without
      }
    }

    // GeoIP lookup for last IP — prefer persisted, fallback to live + persist
    let geoInfo: any = (user as any).geoInfo ?? null
    if (!geoInfo && user.lastIp) {
      geoInfo = await getGeoInfo(user.lastIp).catch(() => null)
      if (geoInfo) {
        prisma.user.update({ where: { id: user.id }, data: { geoInfo } as any }).catch(() => {})
      }
    }

    return { ...safe, rmData, geoInfo, referralsCount: totalReferrals, paidReferralsCount: paidReferrals }
  })

  // ── User referrals list (paginated) ─────────────────────────
  app.get('/users/:id/referrals', admin, async (req) => {
    const { id } = req.params as { id: string }
    const q = req.query as { page?: string; limit?: string; filter?: 'all' | 'paid' }
    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(100, Number(q.limit) || 20)
    const skip = (page - 1) * limit

    const where: any = { referredById: id }
    if (q.filter === 'paid') where.paymentsCount = { gt: 0 }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        select: {
          id: true, email: true, telegramName: true, telegramId: true,
          subStatus: true, createdAt: true,
          totalPaid: true, paymentsCount: true, lastPaymentAt: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    return { items, total, page, limit }
  })

  // ── Change referrer (inviter) for a user ────────────────────
  app.put('/users/:id/referrer', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { referrerId?: string | null }

    // Prevent self-referral
    if (body.referrerId === id) {
      return reply.status(400).send({ error: 'Cannot refer self' })
    }

    const user = await prisma.user.update({
      where: { id },
      data: { referredById: body.referrerId || null },
      select: { id: true, referredById: true },
    })
    return { ok: true, user }
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

    const oldEmail = user.email
    // Update local user
    const updateData: any = {}
    if (body.email !== undefined) updateData.email = body.email || null
    if (body.telegramId !== undefined) updateData.telegramId = body.telegramId || null

    const updated = await prisma.user.update({ where: { id }, data: updateData })

    // Audit log (who changed, before/after)
    await logAudit({
      userId:   (req.user as any).sub,
      action:   'update',
      entity:   'user',
      entityId: id,
      oldData:  { email: user.email, telegramId: user.telegramId },
      newData:  { email: updated.email, telegramId: updated.telegramId },
      ipAddress: req.ip,
    })

    // Notify old email if it was changed (security alert + undo window)
    if (oldEmail && body.email !== undefined && body.email !== oldEmail) {
      try {
        const { emailService } = await import('../services/email')
        await emailService.sendEmailChangedAlert(oldEmail, updated.email || '—')
      } catch (e: any) {
        logger.warn(`Email-changed alert failed: ${e.message}`)
      }
    }

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

  // ── Reset password: generate random password, save hash, email it ──
  app.post('/users/:id/reset-password', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    if (!user.email) return reply.status(400).send({ error: 'У пользователя нет email — сначала привяжите' })

    // Generate 12-char password without lookalikes (I, l, 1, O, 0)
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    let plain = ''
    const randomBytes = await import('crypto').then(m => m.randomBytes(24))
    for (let i = 0; i < 12; i++) plain += ALPHABET[randomBytes[i] % ALPHABET.length]

    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.default.hash(plain, 12)

    await prisma.user.update({
      where: { id },
      data:  { passwordHash: hash, passwordSetAt: new Date() },
    })

    // Send welcome email with password
    try {
      const { emailService } = await import('../services/email')
      await emailService.sendAdminPasswordReset(user.email, plain)
    } catch (e: any) {
      logger.error(`Failed to send password email to ${user.email}: ${e.message}`)
      return reply.status(500).send({ error: 'Пароль сохранён, но email не отправлен: ' + e.message, password: plain })
    }

    // Audit log
    await logAudit({
      userId:   (req.user as any).sub,
      action:   'update',
      entity:   'user.password',
      entityId: id,
      newData:  { resetBy: 'admin', emailTo: user.email },
      ipAddress: req.ip,
    })

    logger.info(`Admin reset password for user ${id} (${user.email})`)
    // Show password to admin once — so it can be communicated if email gets lost
    return { ok: true, password: plain, sentTo: user.email }
  })

  // ─────────────────────────────────────────────────────────
  //  PAYMENTS
  // ─────────────────────────────────────────────────────────
  app.get('/payments', admin, async (req) => {
    const {
      page = '1', limit = '50', status = '', provider = '',
      search = '', userId = '', dateFrom = '', dateTo = '',
      purpose = '', type: paymentType = '',
      userFilter = '', sortBy = 'date', sortDir = 'desc',
    } = req.query as Record<string, string>

    const skip  = (Number(page) - 1) * Number(limit)
    const where: any = {}
    if (status)   where.status   = status
    if (provider) where.provider = provider
    if (userId)   where.userId   = userId
    if (purpose)  where.purpose  = purpose

    // User filter: with/without user
    if (userFilter === 'with') where.userId = { not: null }
    else if (userFilter === 'without') where.userId = null

    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom + 'T00:00:00')
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59')
    }

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { externalPaymentId: { contains: search } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { telegramName: { contains: search, mode: 'insensitive' } } },
        { user: { telegramId: { contains: search } } },
      ]
    }

    // Sorting
    const orderBy: any = sortBy === 'amount'
      ? { amount: sortDir === 'asc' ? 'asc' : 'desc' }
      : { createdAt: sortDir === 'asc' ? 'asc' : 'desc' }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take:    Number(limit),
        orderBy,
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

  // ── Refund payment via YuKassa API ──────────────────────
  app.post('/payments/:id/refund', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { amount } = (req.body || {}) as { amount?: number }

    const payment = await prisma.payment.findUnique({ where: { id }, include: { user: true, tariff: true } })
    if (!payment) return reply.status(404).send({ error: 'Платёж не найден' })
    if (payment.status !== 'PAID') return reply.status(400).send({ error: 'Возврат возможен только для оплаченных платежей' })
    if (!payment.yukassaPaymentId) return reply.status(400).send({ error: 'Нет ID платежа ЮKassa — возврат невозможен' })

    try {
      const { paymentService } = await import('../services/payment')
      const { remnawave } = await import('../services/remnawave')
      const gross = payment.amount + Number(payment.commission || 0)
      const refundAmount = amount || gross

      const refund = await paymentService.yukassa.createRefund(
        payment.yukassaPaymentId,
        refundAmount,
      )

      const refundAmt = parseFloat(refund.amount.value)
      const isFullRefund = refundAmt >= gross - 0.01

      await prisma.payment.update({
        where: { id },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND',
          refundAmount: refundAmt,
          refundedAt: new Date(),
        },
      })

      // Disable subscription on full refund
      if (isFullRefund && payment.user && payment.purpose === 'SUBSCRIPTION') {
        // Rollback local sub expire by tariff days
        const daysToRollback = payment.tariff?.durationDays || 0
        if (payment.user.subExpireAt && daysToRollback > 0) {
          const newExpire = new Date(payment.user.subExpireAt)
          newExpire.setDate(newExpire.getDate() - daysToRollback)
          const now = new Date()
          await prisma.user.update({
            where: { id: payment.user.id },
            data: {
              subExpireAt: newExpire,
              subStatus: newExpire <= now ? 'EXPIRED' : 'ACTIVE',
              totalPaid: { decrement: payment.amount },
              paymentsCount: { decrement: 1 },
            },
          })
        }

        // Disable in REMNAWAVE
        if (payment.user.remnawaveUuid) {
          try {
            const rmUser = await remnawave.getUserByUuid(payment.user.remnawaveUuid)
            const currentExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : new Date()
            const newExpire = new Date(currentExpire)
            newExpire.setDate(newExpire.getDate() - daysToRollback)
            const now = new Date()

            if (newExpire <= now) {
              // Fully disable
              await remnawave.updateUser({
                uuid: payment.user.remnawaveUuid,
                status: 'DISABLED',
                expireAt: newExpire.toISOString(),
              })
            } else {
              // Just shorten
              await remnawave.updateUser({
                uuid: payment.user.remnawaveUuid,
                expireAt: newExpire.toISOString(),
              })
            }
          } catch (e: any) {
            logger.warn(`Failed to rollback REMNAWAVE for user ${payment.user.id}: ${e.message}`)
          }
        }
      }

      logger.info(`Refund created for payment ${id}: amount=${refundAmt}, full=${isFullRefund}`)
      return { ok: true, refundId: refund.id, amount: refundAmt, status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND' }
    } catch (err: any) {
      logger.error(`Refund failed for payment ${id}: ${err?.message}`)
      const msg = err?.response?.data?.description || err?.message || 'Ошибка возврата'
      return reply.status(400).send({ error: msg })
    }
  })

  // ── Payment totals (gross, net, commission, refunds) ────
  // Supports same filters as /payments for period-aware stats
  app.get('/payments/totals', admin, async (req) => {
    const { dateFrom = '', dateTo = '', status: fStatus = '', provider: fProvider = '', userFilter = '' } = req.query as Record<string, string>

    // Base filters (non-date)
    // NOTE: BALANCE/MANUAL payments excluded from totals by default — they are internal
    // transfers (balance top-ups consumed as purchase), not real money inflow
    const baseWhere: any = {}
    if (fStatus) baseWhere.status = fStatus
    if (fProvider) baseWhere.provider = fProvider
    else baseWhere.provider = { in: ['YUKASSA', 'CRYPTOPAY'] }
    if (userFilter === 'with') baseWhere.userId = { not: null }
    else if (userFilter === 'without') baseWhere.userId = null

    // Date filters
    const dateFilter: any = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom + 'T00:00:00')
    if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59')
    const hasDate = dateFrom || dateTo

    // Оборот = платежи по дате создания (когда деньги пришли)
    const oborotWhere = {
      ...baseWhere,
      status: { in: ['PAID', 'REFUNDED', 'PARTIAL_REFUND'] },
      ...(hasDate ? { createdAt: dateFilter } : {}),
    }
    const paidWhere = { ...baseWhere, status: 'PAID', ...(hasDate ? { createdAt: dateFilter } : {}) }

    // Возвраты = по дате возврата (когда деньги ушли обратно клиенту)
    const refundDateWhere = hasDate ? {
      OR: [
        { refundedAt: dateFilter },
        { refundedAt: null, createdAt: dateFilter },
      ],
    } : {}
    const refundedWhere = { ...baseWhere, status: 'REFUNDED' as const, ...refundDateWhere }
    const partialWhere = { ...baseWhere, status: 'PARTIAL_REFUND' as const, ...refundDateWhere }

    const [oborotAgg, paidOnlyAgg, refundAgg, partialAgg, paidCount, refundedCount, partialCount, totalCount] = await Promise.all([
      prisma.payment.aggregate({ where: oborotWhere, _sum: { amount: true, commission: true } }),
      prisma.payment.aggregate({ where: paidWhere, _sum: { amount: true, commission: true } }),
      prisma.payment.aggregate({ where: refundedWhere, _sum: { refundAmount: true } }),
      prisma.payment.aggregate({ where: partialWhere, _sum: { refundAmount: true } }),
      prisma.payment.count({ where: paidWhere }),
      prisma.payment.count({ where: refundedWhere }),
      prisma.payment.count({ where: partialWhere }),
      prisma.payment.count({ where: oborotWhere }),
    ])

    // Оборот по createdAt (gross)
    const oborotNet = Number(oborotAgg._sum.amount ?? 0)
    const oborotComm = Number(oborotAgg._sum.commission ?? 0)
    const oborot = oborotNet + oborotComm

    const refundFull = Number(refundAgg._sum.refundAmount ?? 0)
    const refundPartial = Number(partialAgg._sum.refundAmount ?? 0)
    const totalRefunds = refundFull + refundPartial

    // Выручка = оборот − возвраты
    const revenue = oborot - totalRefunds

    const commissionPct = oborot > 0 ? (oborotComm / oborot * 100) : 0

    // К зачислению = выручка − комиссия
    const credited = revenue - oborotComm

    return {
      oborot,
      revenue,
      commission: oborotComm,
      commissionPct: +commissionPct.toFixed(2),
      totalRefunds,
      credited,
      refundedCount,
      partialRefundCount: partialCount,
      paidCount,
      totalCount,
    }
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

  // SETTINGS — moved to admin-settings.ts (registered at /api/admin/settings)

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

  // ─────────────────────────────────────────────────────────
  //  USER SEGMENTS (saved filter lists)
  // ─────────────────────────────────────────────────────────
  app.get('/segments', admin, async () => {
    return prisma.userSegment.findMany({ orderBy: { createdAt: 'desc' } })
  })

  app.post('/segments', admin, async (req) => {
    const body = z.object({
      name:        z.string().min(1),
      description: z.string().optional().nullable(),
      filters:     z.any(),
      color:       z.string().optional().nullable(),
    }).parse(req.body)
    const userId = (req.user as any)?.sub ?? null
    return prisma.userSegment.create({
      data: {
        name:        body.name,
        description: body.description ?? null,
        filters:     body.filters ?? {},
        color:       body.color ?? '#06b6d4',
        createdById: userId,
      },
    })
  })

  app.put('/segments/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      name:        z.string().optional(),
      description: z.string().nullable().optional(),
      filters:     z.any().optional(),
      color:       z.string().nullable().optional(),
    }).parse(req.body)
    return prisma.userSegment.update({ where: { id }, data: body as any })
  })

  app.delete('/segments/:id', admin, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.userSegment.delete({ where: { id } })
    return { ok: true }
  })

  app.get('/segments/:id/count', admin, async (req) => {
    const { id } = req.params as { id: string }
    const seg = await prisma.userSegment.findUnique({ where: { id } })
    if (!seg) return { count: 0 }
    const filters = (seg.filters as Record<string, any>) || {}
    const where = await buildUsersWhere(filters)
    // Strip in-memory hint flag before passing to Prisma
    if ((where as any).__refsPaidMin !== undefined) delete (where as any).__refsPaidMin
    const count = await prisma.user.count({ where })
    return { count }
  })

  app.get('/segments/:id/users', admin, async (req) => {
    const { id } = req.params as { id: string }
    const seg = await prisma.userSegment.findUnique({ where: { id } })
    if (!seg) return { users: [] }
    const filters = (seg.filters as Record<string, any>) || {}
    const where = await buildUsersWhere(filters)
    if ((where as any).__refsPaidMin !== undefined) delete (where as any).__refsPaidMin
    const users = await prisma.user.findMany({
      where,
      select: { id: true, telegramId: true, email: true },
      take: 10000,
    })
    return { users }
  })
}
