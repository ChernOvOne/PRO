import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import crypto from 'crypto'

const CampaignCreateSchema = z.object({
  date:              z.string(),
  channelName:       z.string().optional().nullable(),
  channelUrl:        z.string().optional().nullable(),
  format:            z.string().optional().nullable(),
  amount:            z.coerce.number(),
  subscribersGained: z.coerce.number().optional().nullable(),
  screenshotUrl:     z.string().optional().nullable(),
  notes:             z.string().optional().nullable(),
  budgetSource:      z.enum(['account', 'investment', 'stats_only']),
  investorPartnerId: z.string().optional().nullable(),
  targetUrl:         z.string().optional().nullable(),
  targetType:        z.enum(['bot', 'channel', 'custom']).default('bot'),
})

export async function adminAdsRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ─────────────────────────────────────────────────────────
  //  LIST AD CAMPAIGNS
  // ─────────────────────────────────────────────────────────
  app.get('/', editor, async (req) => {
    const q = req.query as {
      date_from?: string
      date_to?: string
    }

    const where: any = {}

    if (q.date_from || q.date_to) {
      where.date = {}
      if (q.date_from) where.date.gte = new Date(q.date_from)
      if (q.date_to)   where.date.lte = new Date(q.date_to)
    }

    const items = await prisma.buhAdCampaign.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    return items.map((item) => {
      const amount = Number(item.amount)
      const subs   = item.subscribersGained ?? 0
      return {
        ...item,
        amount,
        costPerSub: subs > 0 ? Math.round((amount / subs) * 100) / 100 : null,
      }
    })
  })

  // ─────────────────────────────────────────────────────────
  //  CREATE AD CAMPAIGN
  // ─────────────────────────────────────────────────────────
  app.post('/', editor, async (req, reply) => {
    const data = CampaignCreateSchema.parse(req.body)
    const user = (req as any).user

    const utmCode = 'ad_' + crypto.randomBytes(4).toString('hex')

    let transactionId: string | null = null

    if (data.budgetSource === 'account') {
      const tx = await prisma.buhTransaction.create({
        data: {
          type:        'EXPENSE',
          amount:      data.amount,
          date:        new Date(data.date),
          description: `Ad: ${data.channelName ?? utmCode}`,
          createdById: user?.sub ?? null,
        },
      })
      transactionId = tx.id
    }

    if (data.budgetSource === 'investment' && data.investorPartnerId) {
      await prisma.buhInkasRecord.create({
        data: {
          partnerId:   data.investorPartnerId,
          type:        'INVESTMENT',
          amount:      data.amount,
          date:        new Date(data.date),
          description: `Ad investment: ${data.channelName ?? utmCode}`,
          createdById: user?.sub ?? null,
        },
      })
    }

    const campaign = await prisma.buhAdCampaign.create({
      data: {
        date:              new Date(data.date),
        channelName:       data.channelName ?? null,
        channelUrl:        data.channelUrl ?? null,
        format:            data.format ?? null,
        amount:            data.amount,
        subscribersGained: data.subscribersGained ?? null,
        screenshotUrl:     data.screenshotUrl ?? null,
        notes:             data.notes ?? null,
        budgetSource:      data.budgetSource,
        investorPartnerId: data.investorPartnerId ?? null,
        transactionId,
        utmCode,
        targetUrl:         data.targetUrl ?? null,
        targetType:        data.targetType,
        createdById:       user?.sub ?? null,
      },
    })

    return reply.status(201).send(campaign)
  })

  // ─────────────────────────────────────────────────────────
  //  UPDATE AD CAMPAIGN
  // ─────────────────────────────────────────────────────────
  app.patch('/:id', editor, async (req, reply) => {
    const { id } = req.params as { id: string }

    const schema = CampaignCreateSchema.partial().omit({ date: true })
    const data = schema.parse(req.body)

    const existing = await prisma.buhAdCampaign.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Campaign not found' })

    const update: any = {}
    if (data.channelName !== undefined)       update.channelName       = data.channelName
    if (data.channelUrl !== undefined)        update.channelUrl        = data.channelUrl
    if (data.format !== undefined)            update.format            = data.format
    if (data.amount !== undefined)            update.amount            = data.amount
    if (data.subscribersGained !== undefined) update.subscribersGained = data.subscribersGained
    if (data.screenshotUrl !== undefined)     update.screenshotUrl     = data.screenshotUrl
    if (data.notes !== undefined)             update.notes             = data.notes
    if (data.budgetSource !== undefined)      update.budgetSource      = data.budgetSource
    if (data.investorPartnerId !== undefined) update.investorPartnerId = data.investorPartnerId
    if (data.targetUrl !== undefined)         update.targetUrl         = data.targetUrl
    if (data.targetType !== undefined)        update.targetType        = data.targetType

    return prisma.buhAdCampaign.update({
      where: { id },
      data: update,
    })
  })

  // ─────────────────────────────────────────────────────────
  //  DELETE AD CAMPAIGN
  // ─────────────────────────────────────────────────────────
  app.delete('/:id', editor, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.buhAdCampaign.delete({ where: { id } })
    return { ok: true }
  })

  // ─────────────────────────────────────────────────────────
  //  SUMMARY
  // ─────────────────────────────────────────────────────────
  app.get('/summary', editor, async (req) => {
    const q = req.query as { date_from?: string; date_to?: string }

    const where: any = {}
    if (q.date_from || q.date_to) {
      where.date = {}
      if (q.date_from) where.date.gte = new Date(q.date_from)
      if (q.date_to)   where.date.lte = new Date(q.date_to)
    }

    const campaigns = await prisma.buhAdCampaign.findMany({ where })

    const totalSpent       = campaigns.reduce((s, c) => s + Number(c.amount), 0)
    const totalSubscribers = campaigns.reduce((s, c) => s + (c.subscribersGained ?? 0), 0)
    const costPerSub       = totalSubscribers > 0 ? Math.round((totalSpent / totalSubscribers) * 100) / 100 : null
    const campaignsCount   = campaigns.length

    // Best channel by cost per subscriber (lowest)
    const channelMap = new Map<string, { spent: number; subs: number }>()
    for (const c of campaigns) {
      if (!c.channelName) continue
      const entry = channelMap.get(c.channelName) ?? { spent: 0, subs: 0 }
      entry.spent += Number(c.amount)
      entry.subs  += c.subscribersGained ?? 0
      channelMap.set(c.channelName, entry)
    }

    let bestChannel: string | null = null
    let bestCps = Infinity
    for (const [name, data] of channelMap) {
      if (data.subs > 0) {
        const cps = data.spent / data.subs
        if (cps < bestCps) {
          bestCps = cps
          bestChannel = name
        }
      }
    }

    return { totalSpent, totalSubscribers, costPerSub, campaignsCount, bestChannel }
  })

  // ─────────────────────────────────────────────────────────
  //  FUNNEL (with revenue & ROI)
  // ─────────────────────────────────────────────────────────
  app.get('/funnel', editor, async () => {
    const campaigns = await prisma.buhAdCampaign.findMany()

    const utmCodes = campaigns.map((c) => c.utmCode)

    const [clickCounts, leadCounts, conversionCounts] = await Promise.all([
      prisma.buhUtmClick.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes } },
        _count: true,
      }),
      prisma.buhUtmLead.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes } },
        _count: true,
      }),
      prisma.buhUtmLead.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes }, converted: true },
        _count: true,
      }),
    ])

    const clickMap      = new Map(clickCounts.map((r) => [r.utmCode, r._count]))
    const leadMap       = new Map(leadCounts.map((r) => [r.utmCode, r._count]))
    const conversionMap = new Map(conversionCounts.map((r) => [r.utmCode, r._count]))

    // Calculate revenue per campaign via UTM leads -> users -> payments
    const revenueMap = new Map<string, number>()
    const ltvMap     = new Map<string, number[]>()

    for (const code of utmCodes) {
      // Find converted leads for this UTM code
      const convertedLeads = await prisma.buhUtmLead.findMany({
        where: { utmCode: code, converted: true, customerId: { not: null } },
        select: { customerId: true },
      })

      const customerIds = convertedLeads
        .map((l) => l.customerId)
        .filter((id): id is string => id !== null)

      if (customerIds.length > 0) {
        // Sum payments for these users
        const paymentSum = await prisma.payment.aggregate({
          where: { userId: { in: customerIds }, status: 'PAID' },
          _sum: { amount: true },
        })
        revenueMap.set(code, Number(paymentSum._sum.amount ?? 0))

        // LTV: get totalPaid per user
        const users = await prisma.user.findMany({
          where: { id: { in: customerIds } },
          select: { totalPaid: true },
        })
        ltvMap.set(code, users.map((u) => Number(u.totalPaid)))
      }
    }

    // Aggregate totals for summary
    let totalClicks = 0, totalLeads = 0, totalConversions = 0, totalRevenue = 0, totalSpent = 0

    const rows = campaigns.map((c) => {
      const amount      = Number(c.amount)
      const clicks      = clickMap.get(c.utmCode) ?? 0
      const leads       = leadMap.get(c.utmCode) ?? 0
      const conversions = conversionMap.get(c.utmCode) ?? 0
      const revenue     = revenueMap.get(c.utmCode) ?? 0
      const cpa         = conversions > 0 ? Math.round((amount / conversions) * 100) / 100 : null
      const roi         = amount > 0 ? Math.round(((revenue - amount) / amount) * 10000) / 100 : null

      const ltvValues = ltvMap.get(c.utmCode) ?? []
      const ltv       = ltvValues.length > 0 ? Math.round(ltvValues.reduce((s, v) => s + v, 0) / ltvValues.length * 100) / 100 : null

      totalClicks      += clicks
      totalLeads       += leads
      totalConversions += conversions
      totalRevenue     += revenue
      totalSpent       += amount

      return {
        utmCode:     c.utmCode,
        channelName: c.channelName,
        amount,
        clicks,
        leads,
        conversions,
        cpa,
        roi,
        revenue,
        ltv,
      }
    })

    // Find best channel by ROI
    const withRoi = rows.filter((r) => r.roi !== null && r.roi !== 0)
    const bestChannel = withRoi.length > 0
      ? withRoi.reduce((best, r) => (r.roi! > (best.roi ?? -Infinity) ? r : best)).channelName
      : null

    const avgCpa = totalConversions > 0
      ? Math.round((totalSpent / totalConversions) * 100) / 100
      : null

    return {
      rows,
      summary: {
        totalClicks,
        totalLeads,
        totalConversions,
        totalRevenue,
        totalSpent,
        bestChannel,
        avgCpa,
      },
    }
  })

  // ─────────────────────────────────────────────────────────
  //  UTM BUILDER — create campaign from UTM params
  // ─────────────────────────────────────────────────────────
  app.post('/utm-builder', editor, async (req, reply) => {
    const schema = z.object({
      baseUrl:      z.string().url(),
      utmSource:    z.string().min(1),
      utmMedium:    z.string().optional(),
      utmCampaign:  z.string().optional(),
    })

    const data = schema.parse(req.body)
    const user = (req as any).user

    const utmCode = 'utm_' + crypto.randomBytes(4).toString('hex')

    // Build the full URL with UTM params
    const url = new URL(data.baseUrl)
    url.searchParams.set('utm_source', data.utmSource)
    if (data.utmMedium)   url.searchParams.set('utm_medium', data.utmMedium)
    if (data.utmCampaign) url.searchParams.set('utm_campaign', data.utmCampaign)

    // Create a lightweight campaign for tracking
    const campaign = await prisma.buhAdCampaign.create({
      data: {
        date:         new Date(),
        channelName:  data.utmSource,
        format:       data.utmMedium ?? null,
        amount:       0,
        utmCode,
        targetUrl:    url.toString(),
        targetType:   'custom',
        notes:        data.utmCampaign ? `Campaign: ${data.utmCampaign}` : null,
        budgetSource: 'stats_only',
        createdById:  user?.sub ?? null,
      },
    })

    return reply.status(201).send({
      campaign,
      utmCode,
      fullUrl: url.toString(),
      goLink: `/go/${utmCode}`,
    })
  })
}
