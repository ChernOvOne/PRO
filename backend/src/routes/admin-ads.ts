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

    // Enrich each campaign with stats (clicks, leads, conversions, revenue)
    const utmCodes = items.map(i => i.utmCode)

    const [clicksByCode, leadsByCode, convertedByCode, usersByCode] = await Promise.all([
      prisma.buhUtmClick.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes } },
        _count: { _all: true },
      }),
      prisma.buhUtmLead.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes } },
        _count: { _all: true },
      }),
      prisma.buhUtmLead.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes }, converted: true },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: { customerSource: { in: utmCodes } },
        select: { id: true, customerSource: true },
      }),
    ])

    // Map user IDs by utm
    const userIdsByCode: Record<string, string[]> = {}
    usersByCode.forEach(u => {
      if (!u.customerSource) return
      if (!userIdsByCode[u.customerSource]) userIdsByCode[u.customerSource] = []
      userIdsByCode[u.customerSource].push(u.id)
    })

    // Payments per campaign
    const allUserIds = usersByCode.map(u => u.id)
    const payments = allUserIds.length > 0
      ? await prisma.payment.findMany({
          where: { userId: { in: allUserIds }, status: 'PAID', amount: { gt: 0 } },
          select: { amount: true, userId: true },
        })
      : []
    const revenueByUser: Record<string, number> = {}
    payments.forEach(p => { revenueByUser[p.userId] = (revenueByUser[p.userId] || 0) + Number(p.amount) })

    const clicksMap = Object.fromEntries(clicksByCode.map(x => [x.utmCode, x._count._all]))
    const leadsMap = Object.fromEntries(leadsByCode.map(x => [x.utmCode, x._count._all]))
    const convertedMap = Object.fromEntries(convertedByCode.map(x => [x.utmCode, x._count._all]))

    return items.map((item) => {
      const amount = Number(item.amount)
      const subs = item.subscribersGained ?? 0
      const clicks = clicksMap[item.utmCode] || 0
      const leads = leadsMap[item.utmCode] || 0
      const conversions = convertedMap[item.utmCode] || 0
      const userIds = userIdsByCode[item.utmCode] || []
      const revenue = userIds.reduce((s, uid) => s + (revenueByUser[uid] || 0), 0)
      const roi = amount > 0 ? Math.round(((revenue - amount) / amount) * 100) : 0
      // LTV = средний доход с одного оплатившего клиента
      const ltv = conversions > 0 ? Math.round((revenue / conversions) * 100) / 100 : 0
      // CAC = стоимость привлечения одного оплатившего клиента
      const cac = conversions > 0 ? Math.round((amount / conversions) * 100) / 100 : null
      // LTV/CAC ratio (≥3 — здоровый показатель)
      const ltvCacRatio = cac && cac > 0 ? Math.round((ltv / cac) * 100) / 100 : null
      return {
        ...item,
        amount,
        costPerSub: subs > 0 ? Math.round((amount / subs) * 100) / 100 : null,
        clicks,
        leads,
        conversions,
        revenue,
        roi,
        ltv,
        cac,
        ltvCacRatio,
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

    // Измеренные конверсии по UTM-кодам (оплаты)
    const utmCodes = campaigns.map(c => c.utmCode).filter((x): x is string => !!x)
    const convBy = new Map<string, number>()
    const revBy  = new Map<string, number>()
    if (utmCodes.length) {
      const leads = await prisma.buhUtmLead.groupBy({
        by: ['utmCode'],
        where: { utmCode: { in: utmCodes }, converted: true },
        _count: { _all: true },
      })
      for (const l of leads) convBy.set(l.utmCode, l._count._all)

      // Доход считаем по оплатам клиентов с customerSource = utm
      const customers = await prisma.user.groupBy({
        by: ['customerSource'],
        where: { customerSource: { in: utmCodes } },
        _sum: { totalPaid: true },
      })
      for (const c of customers) {
        if (c.customerSource) revBy.set(c.customerSource, Number(c._sum.totalPaid ?? 0))
      }
    }

    const totalSpent     = campaigns.reduce((s, c) => s + Number(c.amount), 0)
    // Подписчики = только реально оплатившие клиенты (из UTM-конверсий).
    // Поле subscribersGained в базе — это охват канала, не клиенты.
    const totalSubscribers = campaigns.reduce((s, c) => {
      return s + (c.utmCode ? (convBy.get(c.utmCode) ?? 0) : 0)
    }, 0)
    const costPerSub     = totalSubscribers > 0 ? Math.round((totalSpent / totalSubscribers) * 100) / 100 : null
    const campaignsCount = campaigns.length

    // Best channel by cost per subscriber (lowest)
    const channelMap = new Map<string, { spent: number; subs: number }>()
    for (const c of campaigns) {
      if (!c.channelName) continue
      const entry = channelMap.get(c.channelName) ?? { spent: 0, subs: 0 }
      entry.spent += Number(c.amount)
      entry.subs  += c.utmCode ? (convBy.get(c.utmCode) ?? 0) : 0
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

  // ─────────────────────────────────────────────────────────
  //  GET CAMPAIGN DETAIL WITH FULL STATS
  // ─────────────────────────────────────────────────────────
  app.get('/:id/stats', editor, async (req) => {
    const { id } = req.params as { id: string }
    const q = req.query as { groupBy?: 'day' | 'week' | 'month' }
    const groupBy = q.groupBy || 'day'

    const campaign = await prisma.buhAdCampaign.findUnique({ where: { id } })
    if (!campaign) return { error: 'Not found' }

    const utmCode = campaign.utmCode

    // All data
    const [clicks, leads, users] = await Promise.all([
      prisma.buhUtmClick.findMany({ where: { utmCode }, orderBy: { createdAt: 'asc' } }),
      prisma.buhUtmLead.findMany({ where: { utmCode }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findMany({ where: { customerSource: utmCode }, select: { id: true, totalPaid: true, createdAt: true } }),
    ])

    // Payments from UTM users
    const userIds = users.map(u => u.id)
    const payments = userIds.length > 0
      ? await prisma.payment.findMany({
          where: { userId: { in: userIds }, status: 'PAID', amount: { gt: 0 } },
          select: { amount: true, createdAt: true, userId: true },
          orderBy: { createdAt: 'asc' },
        })
      : []

    // Totals
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0)
    const spend = Number(campaign.amount)
    const profit = totalRevenue - spend
    const roi = spend > 0 ? Math.round(((totalRevenue - spend) / spend) * 100) : 0
    const convertedLeads = leads.filter(l => l.converted).length
    const conversionRate = clicks.length > 0 ? Math.round((convertedLeads / clicks.length) * 10000) / 100 : 0
    const cpa = convertedLeads > 0 ? Math.round((spend / convertedLeads) * 100) / 100 : 0
    const ltv = users.length > 0 ? Math.round((users.reduce((s, u) => s + Number(u.totalPaid), 0) / users.length) * 100) / 100 : 0

    // Time series grouping
    const bucketKey = (date: Date): string => {
      const d = new Date(date)
      if (groupBy === 'day') return d.toISOString().slice(0, 10)
      if (groupBy === 'week') {
        const day = d.getDay() || 7
        d.setDate(d.getDate() - day + 1)
        return d.toISOString().slice(0, 10)
      }
      return d.toISOString().slice(0, 7) // month
    }

    const series: Record<string, { date: string; clicks: number; leads: number; conversions: number; revenue: number }> = {}
    const ensure = (key: string) => {
      if (!series[key]) series[key] = { date: key, clicks: 0, leads: 0, conversions: 0, revenue: 0 }
      return series[key]
    }
    clicks.forEach(c => ensure(bucketKey(c.createdAt)).clicks++)
    leads.forEach(l => {
      const b = ensure(bucketKey(l.createdAt))
      b.leads++
      if (l.converted) b.conversions++
    })
    payments.forEach(p => ensure(bucketKey(p.createdAt)).revenue += Number(p.amount))

    const timeSeries = Object.values(series).sort((a, b) => a.date.localeCompare(b.date))

    return {
      campaign,
      utmCode,
      summary: {
        clicks: clicks.length,
        leads: leads.length,
        conversions: convertedLeads,
        revenue: totalRevenue,
        spend,
        profit,
        roi,
        conversionRate,
        cpa,
        ltv,
        users: users.length,
      },
      timeSeries,
    }
  })

  // ─────────────────────────────────────────────────────────
  //  EXPORT CAMPAIGN REPORT (PDF/Excel)
  // ─────────────────────────────────────────────────────────
  app.get('/:id/export', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const q = req.query as { format?: 'pdf' | 'excel' }
    const fmt = q.format || 'pdf'

    const campaign = await prisma.buhAdCampaign.findUnique({ where: { id } })
    if (!campaign) return reply.status(404).send({ error: 'Not found' })

    const utmCode = campaign.utmCode
    const [clickRecords, leads, users] = await Promise.all([
      prisma.buhUtmClick.findMany({ where: { utmCode }, select: { createdAt: true } }),
      prisma.buhUtmLead.findMany({ where: { utmCode } }),
      prisma.user.findMany({ where: { customerSource: utmCode }, select: { id: true, email: true, telegramName: true, totalPaid: true, createdAt: true, subStatus: true } }),
    ])
    const clicks = clickRecords.length
    const userIds = users.map(u => u.id)
    const payments = userIds.length > 0
      ? await prisma.payment.findMany({ where: { userId: { in: userIds }, status: 'PAID', amount: { gt: 0 } }, select: { amount: true, createdAt: true } })
      : []
    const revenue = payments.reduce((s, p) => s + Number(p.amount), 0)
    const spend = Number(campaign.amount)
    const convertedLeads = leads.filter(l => l.converted).length
    const profit = revenue - spend
    const roi = spend > 0 ? Math.round(((revenue - spend) / spend) * 100) : 0
    const cpa = convertedLeads > 0 ? Math.round((spend / convertedLeads) * 100) / 100 : 0
    // LTV = средний доход с оплатившего клиента
    const ltv = convertedLeads > 0 ? Math.round((revenue / convertedLeads) * 100) / 100 : 0
    const ltvCacRatio = cpa > 0 ? Math.round((ltv / cpa) * 100) / 100 : 0
    const convRate = clicks > 0 ? Math.round((convertedLeads / clicks) * 10000) / 100 : 0

    // Time series by day
    const seriesMap: Record<string, { clicks: number; leads: number; conversions: number; revenue: number }> = {}
    const ensureDay = (date: Date) => {
      const key = new Date(date).toISOString().slice(0, 10)
      if (!seriesMap[key]) seriesMap[key] = { clicks: 0, leads: 0, conversions: 0, revenue: 0 }
      return { key, row: seriesMap[key] }
    }
    clickRecords.forEach(c => ensureDay(c.createdAt).row.clicks++)
    leads.forEach(l => {
      const { row } = ensureDay(l.createdAt)
      row.leads++
      if (l.converted) row.conversions++
    })
    payments.forEach(p => ensureDay(p.createdAt).row.revenue += Number(p.amount))
    const series = Object.entries(seriesMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, ...r }))

    if (fmt === 'excel') {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'HIDEYOU PRO'
      wb.created = new Date()

      // Sheet 1: Summary
      const s1 = wb.addWorksheet('Сводка', { views: [{ state: 'frozen', ySplit: 0 }] })
      s1.columns = [{ width: 28 }, { width: 30 }]

      // Title
      s1.mergeCells('A1:B1')
      const titleCell = s1.getCell('A1')
      titleCell.value = `Отчёт по кампании: ${campaign.channelName || utmCode}`
      titleCell.font = { size: 16, bold: true, color: { argb: 'FF534AB7' } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
      s1.getRow(1).height = 32

      // Campaign info
      const infoRows: [string, any][] = [
        ['', ''],
        ['Информация о кампании', ''],
        ['Название', campaign.channelName || '—'],
        ['UTM код', utmCode],
        ['Дата запуска', new Date(campaign.date).toLocaleDateString('ru-RU')],
        ['Канал', campaign.channelUrl || '—'],
        ['Формат', campaign.format || '—'],
        ['', ''],
        ['Ключевые метрики', ''],
        ['Затраты, ₽', spend],
        ['Доход, ₽', revenue],
        ['Прибыль, ₽', profit],
        ['ROI, %', roi],
        ['Клики', clicks],
        ['Лиды', leads.length],
        ['Конверсии', convertedLeads],
        ['Коэф. конверсии, %', convRate],
        ['Ср. цена клиента (CAC), ₽', cpa],
        ['LTV, ₽', ltv],
        ['LTV/CAC', ltvCacRatio > 0 ? `${ltvCacRatio}×` : '—'],
        ['Оплативших клиентов', convertedLeads],
      ]
      infoRows.forEach(r => s1.addRow(r))

      // Style section headers
      ;[2, 9].forEach(row => {
        const rowIdx = row + 1 // after title + empty
        s1.mergeCells(`A${rowIdx}:B${rowIdx}`)
        const c = s1.getCell(`A${rowIdx}`)
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF534AB7' } }
        c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
        s1.getRow(rowIdx).height = 24
      })

      // Style data rows
      for (let i = 4; i <= s1.rowCount; i++) {
        const labelCell = s1.getCell(`A${i}`)
        const valCell = s1.getCell(`B${i}`)
        if (labelCell.value) {
          labelCell.font = { size: 11, color: { argb: 'FF374151' } }
          labelCell.alignment = { vertical: 'middle', indent: 1 }
          valCell.font = { size: 11, bold: true, color: { argb: 'FF111827' } }
          valCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 }
          labelCell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
          valCell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
        }
      }

      // ROI color
      const roiRow = s1.getRow(13)
      roiRow.getCell(2).font = { size: 11, bold: true, color: { argb: roi >= 0 ? 'FF059669' : 'FFDC2626' } }

      // Sheet 2: Users
      const s2 = wb.addWorksheet('Пользователи')
      s2.columns = [
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Telegram', key: 'tg', width: 20 },
        { header: 'Статус', key: 'status', width: 14 },
        { header: 'Оплачено, ₽', key: 'paid', width: 14 },
        { header: 'Дата регистрации', key: 'created', width: 18 },
      ]
      users.forEach(u => s2.addRow({
        email: u.email || '—',
        tg: u.telegramName || '—',
        status: u.subStatus,
        paid: Number(u.totalPaid),
        created: new Date(u.createdAt).toLocaleDateString('ru-RU'),
      }))
      s2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      s2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF534AB7' } }
      s2.getRow(1).height = 24
      s2.getRow(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

      // Sheet 3: Time series
      const s3 = wb.addWorksheet('Динамика по дням')
      s3.columns = [
        { header: 'Дата', key: 'date', width: 14 },
        { header: 'Клики', key: 'clicks', width: 10 },
        { header: 'Лиды', key: 'leads', width: 10 },
        { header: 'Конверсии', key: 'conversions', width: 12 },
        { header: 'Доход, ₽', key: 'revenue', width: 14 },
      ]
      series.forEach(r => s3.addRow(r))
      s3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      s3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF534AB7' } }
      s3.getRow(1).height = 24
      s3.getRow(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

      const buffer = await wb.xlsx.writeBuffer()
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      reply.header('Content-Disposition', `attachment; filename="campaign_${utmCode}.xlsx"`)
      return Buffer.from(buffer)
    }

    // PDF: Build an HTML that can be saved/printed as PDF (with inline SVG chart)
    const maxVal = Math.max(1, ...series.map(s => Math.max(s.clicks, s.leads, s.conversions)))
    const chartW = 700
    const chartH = 200
    const barGroupW = series.length > 0 ? chartW / series.length : chartW
    const barW = Math.max(4, Math.min(20, barGroupW / 4))

    const chartSvg = series.length > 0 ? `<svg width="${chartW}" height="${chartH + 40}" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="${chartH}" x2="${chartW}" y2="${chartH}" stroke="#d1d5db" stroke-width="1"/>
      ${series.map((s, i) => {
        const x = i * barGroupW + barGroupW / 2 - barW * 1.5
        const clickH = (s.clicks / maxVal) * (chartH - 10)
        const leadH = (s.leads / maxVal) * (chartH - 10)
        const convH = (s.conversions / maxVal) * (chartH - 10)
        return `
          <rect x="${x}" y="${chartH - clickH}" width="${barW}" height="${clickH}" fill="#60a5fa" rx="2"/>
          <rect x="${x + barW}" y="${chartH - leadH}" width="${barW}" height="${leadH}" fill="#fbbf24" rx="2"/>
          <rect x="${x + barW * 2}" y="${chartH - convH}" width="${barW}" height="${convH}" fill="#34d399" rx="2"/>
          <text x="${x + barW * 1.5}" y="${chartH + 15}" text-anchor="middle" font-size="9" fill="#6b7280">${s.date.slice(5)}</text>
        `
      }).join('')}
    </svg>` : '<p style="color:#9ca3af">Нет данных для графика</p>'

    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт ${utmCode}</title>
<style>
@page{size:A4;margin:1.5cm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;background:#fff;padding:20px;max-width:800px;margin:0 auto}
.header{background:linear-gradient(135deg,#534AB7,#7c3aed);color:#fff;padding:24px;border-radius:12px;margin-bottom:24px}
.header h1{font-size:24px;margin-bottom:8px}
.header .meta{font-size:13px;opacity:0.9;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:12px}
.header .meta span{display:block}
.section-title{font-size:14px;font-weight:700;color:#534AB7;text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid #534AB7}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.kpi{background:#f9fafb;padding:12px;border-radius:8px;border-left:3px solid #534AB7}
.kpi-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px}
.kpi-value{font-size:18px;font-weight:700;color:#111827}
.kpi.pos .kpi-value{color:#059669}.kpi.neg .kpi-value{color:#dc2626}
.kpi.pos{border-left-color:#059669}.kpi.neg{border-left-color:#dc2626}
.chart{background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:16px}
.chart-legend{display:flex;gap:16px;margin-top:8px;font-size:11px;color:#6b7280}
.chart-legend span{display:flex;align-items:center;gap:6px}
.chart-legend .dot{width:10px;height:10px;border-radius:2px}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:#534AB7;color:#fff;padding:10px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase}
thead th:last-child,tbody td:last-child{text-align:right}
tbody td{padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#374151}
tbody tr:last-child td{border-bottom:none}
tbody tr:nth-child(even){background:#f9fafb}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:10px}
.print-btn{position:fixed;top:20px;right:20px;background:#534AB7;color:#fff;padding:10px 18px;border-radius:8px;border:none;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(83,74,183,0.3)}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨 Сохранить в PDF</button>

<div class="header">
  <h1>📊 Отчёт по рекламной кампании</h1>
  <div class="meta">
    <span><strong>Кампания:</strong> ${campaign.channelName || '—'}</span>
    <span><strong>UTM:</strong> ${utmCode}</span>
    <span><strong>Дата запуска:</strong> ${new Date(campaign.date).toLocaleDateString('ru-RU')}</span>
    <span><strong>Формат:</strong> ${campaign.format || '—'}</span>
  </div>
</div>

<div class="section-title">Ключевые метрики</div>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Затраты</div><div class="kpi-value">${spend.toLocaleString('ru-RU')} ₽</div></div>
  <div class="kpi"><div class="kpi-label">Доход</div><div class="kpi-value">${revenue.toLocaleString('ru-RU')} ₽</div></div>
  <div class="kpi ${profit >= 0 ? 'pos' : 'neg'}"><div class="kpi-label">Прибыль</div><div class="kpi-value">${profit >= 0 ? '+' : ''}${profit.toLocaleString('ru-RU')} ₽</div></div>
  <div class="kpi ${roi >= 0 ? 'pos' : 'neg'}"><div class="kpi-label">ROI</div><div class="kpi-value">${roi >= 0 ? '+' : ''}${roi}%</div></div>
</div>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Клики</div><div class="kpi-value">${clicks}</div></div>
  <div class="kpi"><div class="kpi-label">Лиды</div><div class="kpi-value">${leads.length}</div></div>
  <div class="kpi"><div class="kpi-label">Оплатили</div><div class="kpi-value">${convertedLeads}</div></div>
  <div class="kpi"><div class="kpi-label">Конверсия</div><div class="kpi-value">${convRate}%</div></div>
</div>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Ср. цена клиента</div><div class="kpi-value">${cpa > 0 ? cpa.toLocaleString('ru-RU') + ' ₽' : '—'}</div></div>
  <div class="kpi"><div class="kpi-label">LTV</div><div class="kpi-value">${ltv > 0 ? ltv.toLocaleString('ru-RU') + ' ₽' : '—'}</div></div>
  <div class="kpi ${ltvCacRatio >= 3 ? 'pos' : ltvCacRatio >= 1 ? '' : 'neg'}"><div class="kpi-label">LTV/CAC</div><div class="kpi-value">${ltvCacRatio > 0 ? ltvCacRatio + '×' : '—'}</div></div>
  <div class="kpi"><div class="kpi-label">Охват канала</div><div class="kpi-value">${(campaign.subscribersGained ?? 0).toLocaleString('ru-RU')}</div></div>
</div>

<div class="section-title">Динамика по дням</div>
<div class="chart">
  ${chartSvg}
  <div class="chart-legend">
    <span><span class="dot" style="background:#60a5fa"></span>Клики</span>
    <span><span class="dot" style="background:#fbbf24"></span>Лиды</span>
    <span><span class="dot" style="background:#34d399"></span>Конверсии</span>
  </div>
</div>

<div class="footer">
  Сгенерировано ${new Date().toLocaleString('ru-RU')} · HIDEYOU PRO
</div>
</body></html>`
    reply.header('Content-Type', 'text/html; charset=utf-8')
    // Open in browser (not download) so user can Ctrl+P → Save as PDF
    return html
  })
}
