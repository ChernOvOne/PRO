import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { remnawave } from '../services/remnawave'

type Days = 1 | 7 | 30 | 365

// In-memory store of dismissed alerts (MVP).
// Key is `${alertKey}`, value = dismissedAt. Admin can press "Просмотрено"
// to hide a given (alert, value) combination until the value changes.
const dismissedAlerts = new Map<string, Date>()

function parseDays(raw: any): Days {
  const n = Number(raw)
  if (n === 1 || n === 7 || n === 30 || n === 365) return n as Days
  return 30
}

function dateKey(d: Date): string {
  // Use local timezone (container is on Europe/Moscow) instead of UTC
  // to match Postgres DATE(... AT TIME ZONE 'Europe/Moscow') results
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fillDailySeries(
  from: Date,
  days: number,
  rows: Array<{ date: string; value: number }>,
): Array<{ date: string; value: number }> {
  const map = new Map(rows.map(r => [r.date, r.value]))
  const out: Array<{ date: string; value: number }> = []
  const base = new Date(from)
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const key = dateKey(d)
    out.push({ date: key, value: map.get(key) ?? 0 })
  }
  return out
}

// ── Collect all overview data (shared by /overview and /export) ──
async function collectOverview(days: Days, customFrom?: string, customTo?: string) {
  const now = new Date()
  let to: Date
  let from: Date

  if (customFrom && customTo) {
    from = new Date(customFrom)
    from.setHours(0, 0, 0, 0)
    to = new Date(customTo)
    to.setHours(23, 59, 59, 999)
    days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)) as Days
  } else {
    to = new Date(now)
    to.setHours(23, 59, 59, 999)
    from = new Date(now)
    from.setDate(from.getDate() - (days - 1))
    from.setHours(0, 0, 0, 0)
  }

  const prevTo = new Date(from.getTime() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (days - 1))
  prevFrom.setHours(0, 0, 0, 0)

  // ── KPI: revenue / profit / customers ──
  // Use the same formula as /admin/payments/totals to keep numbers identical:
  //   oborot   = sum(amount + commission) for PAID + REFUNDED + PARTIAL_REFUND by createdAt
  //   refunds  = sum(refundAmount) for REFUNDED + PARTIAL_REFUND
  //   revenue  = oborot − refunds − commission  (= "К зачислению" на странице платежей)
  const provFilter = { in: ['YUKASSA', 'CRYPTOPAY'] as any }
  const realStatuses = { in: ['PAID', 'REFUNDED', 'PARTIAL_REFUND'] as any }

  // Refund date filter (refundedAt or fallback to createdAt for old refunds)
  const refundDateWhereCur: any = {
    OR: [
      { refundedAt: { gte: from, lte: to } },
      { refundedAt: null, createdAt: { gte: from, lte: to } },
    ],
  }
  const refundDateWherePrev: any = {
    OR: [
      { refundedAt: { gte: prevFrom, lte: prevTo } },
      { refundedAt: null, createdAt: { gte: prevFrom, lte: prevTo } },
    ],
  }

  const [
    oborotAgg, oborotPrevAgg,
    refundAgg, refundPrevAgg,
    newCustomers, newCustomersPaid,
    incomeAgg, expenseAgg,
    incomePrevAgg, expensePrevAgg,
  ] = await Promise.all([
    // Oborot for current period
    prisma.payment.aggregate({
      where: { status: realStatuses, provider: provFilter, createdAt: { gte: from, lte: to } },
      _sum: { amount: true, commission: true },
    }),
    prisma.payment.aggregate({
      where: { status: realStatuses, provider: provFilter, createdAt: { gte: prevFrom, lte: prevTo } },
      _sum: { amount: true, commission: true },
    }),
    // Refunds for current period (by refundedAt)
    prisma.payment.aggregate({
      where: { status: { in: ['REFUNDED', 'PARTIAL_REFUND'] }, provider: provFilter, ...refundDateWhereCur },
      _sum: { refundAmount: true },
    }),
    prisma.payment.aggregate({
      where: { status: { in: ['REFUNDED', 'PARTIAL_REFUND'] }, provider: provFilter, ...refundDateWherePrev },
      _sum: { refundAmount: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.user.count({
      where: { createdAt: { gte: from, lte: to }, paymentsCount: { gt: 0 } },
    }),
    prisma.buhTransaction.aggregate({
      where: { type: 'INCOME', date: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.buhTransaction.aggregate({
      where: { type: 'EXPENSE', date: { gte: from, lte: to }, NOT: { source: 'investment' } },
      _sum: { amount: true },
    }),
    prisma.buhTransaction.aggregate({
      where: { type: 'INCOME', date: { gte: prevFrom, lte: prevTo } },
      _sum: { amount: true },
    }),
    prisma.buhTransaction.aggregate({
      where: { type: 'EXPENSE', date: { gte: prevFrom, lte: prevTo }, NOT: { source: 'investment' } },
      _sum: { amount: true },
    }),
  ])

  // Period: revenue = oborot − refunds − commission (matches "К зачислению" on payments page)
  const oborotNet = Number(oborotAgg._sum?.amount ?? 0)
  const oborotComm = Number(oborotAgg._sum?.commission ?? 0)
  const oborot = oborotNet + oborotComm
  const refunds = Number(refundAgg._sum?.refundAmount ?? 0)
  const revenue = oborot - refunds - oborotComm  // = oborotNet - refunds

  const oborotNetPrev = Number(oborotPrevAgg._sum?.amount ?? 0)
  const oborotCommPrev = Number(oborotPrevAgg._sum?.commission ?? 0)
  const oborotPrev = oborotNetPrev + oborotCommPrev
  const refundsPrev = Number(refundPrevAgg._sum?.refundAmount ?? 0)
  const revenuePrev = oborotPrev - refundsPrev - oborotCommPrev

  const manualIncome = Number(incomeAgg._sum.amount ?? 0)
  const expense = Number(expenseAgg._sum.amount ?? 0)
  const profit = revenue + manualIncome - expense
  const profitPrev = revenuePrev + Number(incomePrevAgg._sum.amount ?? 0) - Number(expensePrevAgg._sum.amount ?? 0)

  // ── Revenue chart (income from payments + expense by day) ──
  // Use confirmed_at in Moscow timezone to match KPI revenue calculation
  const incomeByDayRows = await prisma.$queryRaw<Array<{ date: Date; total: number }>>`
    SELECT DATE(confirmed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow') as date, COALESCE(SUM(amount), 0)::numeric AS total
    FROM payments
    WHERE status = 'PAID' AND provider IN ('YUKASSA', 'CRYPTOPAY')
      AND confirmed_at IS NOT NULL AND confirmed_at >= ${from} AND confirmed_at <= ${to}
    GROUP BY DATE(confirmed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow') ORDER BY date ASC
  `
  const expenseByDayRows = await prisma.$queryRaw<Array<{ date: Date; total: number }>>`
    SELECT date, COALESCE(SUM(amount), 0)::numeric AS total
    FROM buh_transactions
    WHERE type = 'EXPENSE' AND source IS DISTINCT FROM 'investment' AND date >= ${from} AND date <= ${to}
    GROUP BY date ORDER BY date ASC
  `
  const incomeSeries = fillDailySeries(from, days, incomeByDayRows.map(r => ({
    date: dateKey(new Date(r.date)),
    value: Number(r.total),
  })))
  const expenseSeries = fillDailySeries(from, days, expenseByDayRows.map(r => ({
    date: dateKey(new Date(r.date)),
    value: Number(r.total),
  })))
  const revenueChart = incomeSeries.map((row, i) => ({
    date: row.date,
    income: row.value,
    expense: expenseSeries[i]?.value ?? 0,
  }))

  // ── Marketing ──
  // Exclude historical campaigns (imported from xlsx) — they don't have real UTM data
  const campaigns = await prisma.buhAdCampaign.findMany({
    where: {
      date: { gte: from, lte: to },
      NOT: { utmCode: { startsWith: 'hist-' } },
    },
    orderBy: { date: 'desc' },
  })
  const utmCodes = campaigns.map(c => c.utmCode)

  const [clicksBy, leadsBy, convertedBy, usersBy] = utmCodes.length > 0 ? await Promise.all([
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
  ]) : [[], [], [], []] as any

  const userIdsByCode: Record<string, string[]> = {}
  ;(usersBy as Array<{ id: string; customerSource: string | null }>).forEach(u => {
    if (!u.customerSource) return
    if (!userIdsByCode[u.customerSource]) userIdsByCode[u.customerSource] = []
    userIdsByCode[u.customerSource].push(u.id)
  })
  const allUserIds = (usersBy as Array<{ id: string }>).map(u => u.id)
  const campaignPayments = allUserIds.length > 0
    ? await prisma.payment.findMany({
        where: { userId: { in: allUserIds }, status: 'PAID', amount: { gt: 0 } },
        select: { amount: true, userId: true, confirmedAt: true },
      })
    : []
  const revenueByUser: Record<string, number> = {}
  campaignPayments.forEach(p => {
    if (p.userId) revenueByUser[p.userId] = (revenueByUser[p.userId] || 0) + Number(p.amount)
  })

  const clicksMap = Object.fromEntries((clicksBy as any[]).map(x => [x.utmCode, x._count._all]))
  const leadsMap = Object.fromEntries((leadsBy as any[]).map(x => [x.utmCode, x._count._all]))
  const convertedMap = Object.fromEntries((convertedBy as any[]).map(x => [x.utmCode, x._count._all]))

  let totalSpend = 0
  let totalMarketingRevenue = 0
  let totalClicks = 0
  let totalLeads = 0
  let totalConversions = 0
  const ltvCacList: number[] = []

  const enrichedCampaigns = campaigns.map(c => {
    const amount = Number(c.amount)
    const clicks = clicksMap[c.utmCode] || 0
    const leads = leadsMap[c.utmCode] || 0
    const conversions = convertedMap[c.utmCode] || 0
    const userIds = userIdsByCode[c.utmCode] || []
    const campaignRevenue = userIds.reduce((s, uid) => s + (revenueByUser[uid] || 0), 0)
    const roi = amount > 0 ? Math.round(((campaignRevenue - amount) / amount) * 100) : 0
    const ltv = conversions > 0 ? campaignRevenue / conversions : 0
    const cac = conversions > 0 ? amount / conversions : 0
    const ltvCac = cac > 0 ? ltv / cac : null

    totalSpend += amount
    totalMarketingRevenue += campaignRevenue
    totalClicks += clicks
    totalLeads += leads
    totalConversions += conversions
    if (ltvCac !== null && isFinite(ltvCac)) ltvCacList.push(ltvCac)

    return {
      id: c.id,
      channelName: c.channelName ?? '(без имени)',
      spend: amount,
      revenue: campaignRevenue,
      roi,
      conversions,
      date: c.date,
      utmCode: c.utmCode,
    }
  })

  const topCampaigns = [...enrichedCampaigns]
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 3)
    .map(c => ({
      id: c.id,
      channelName: c.channelName,
      spend: c.spend,
      revenue: c.revenue,
      roi: c.roi,
      conversions: c.conversions,
    }))

  // Campaigns by day (spend vs revenue)
  const spendByDay: Record<string, number> = {}
  const revenueByDay: Record<string, number> = {}
  enrichedCampaigns.forEach(c => {
    const key = dateKey(new Date(c.date))
    spendByDay[key] = (spendByDay[key] || 0) + c.spend
  })
  campaignPayments.forEach(p => {
    if (!p.confirmedAt) return
    const key = dateKey(new Date(p.confirmedAt))
    revenueByDay[key] = (revenueByDay[key] || 0) + Number(p.amount)
  })
  const campaignsByDay = fillDailySeries(from, days, Object.entries(spendByDay).map(([date, value]) => ({ date, value })))
    .map(row => ({
      date: row.date,
      spend: row.value,
      revenue: revenueByDay[row.date] ?? 0,
    }))

  const funnelRate = totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0
  const ltvCacAvg = ltvCacList.length > 0
    ? Math.round((ltvCacList.reduce((s, v) => s + v, 0) / ltvCacList.length) * 100) / 100
    : null

  // ── Customers ──
  const [
    newByDayRows, topByLtv,
    activeCount, expiredCount, trialCount,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ date: Date; total: number }>>`
      SELECT DATE_TRUNC('day', "created_at")::date AS date, COUNT(*)::int AS total
      FROM users
      WHERE "created_at" >= ${from} AND "created_at" <= ${to}
      GROUP BY 1 ORDER BY 1 ASC
    `,
    prisma.user.findMany({
      orderBy: { totalPaid: 'desc' },
      take: 5,
      select: {
        id: true, email: true, telegramName: true,
        totalPaid: true, paymentsCount: true,
      },
    }),
    prisma.user.count({ where: { subStatus: 'ACTIVE' } }),
    prisma.user.count({ where: { subStatus: 'EXPIRED' } }),
    prisma.user.count({ where: { subStatus: 'TRIAL' } }),
  ])

  const newByDay = fillDailySeries(from, days, newByDayRows.map(r => ({
    date: dateKey(new Date(r.date)),
    value: Number(r.total),
  }))).map(row => ({ date: row.date, count: row.value }))

  const conversionRate = newCustomers > 0
    ? Math.round((newCustomersPaid / newCustomers) * 10000) / 100
    : 0

  // ── Top referrers (users who invited the most paying customers) ──
  let topReferrers: Array<{
    id: string
    email: string | null
    telegramName: string | null
    referralCount: number
    totalCount: number
  }> = []
  try {
    const topReferrersRaw = await prisma.$queryRaw<Array<{
      id: string
      email: string | null
      telegram_name: string | null
      total_refs: bigint
      paid_refs: bigint
    }>>`
      SELECT
        u.id, u.email, u.telegram_name,
        COUNT(r.id)::bigint as total_refs,
        COUNT(CASE WHEN r.payments_count > 0 THEN 1 END)::bigint as paid_refs
      FROM users u
      INNER JOIN users r ON r.referred_by_id = u.id
      GROUP BY u.id, u.email, u.telegram_name
      HAVING COUNT(CASE WHEN r.payments_count > 0 THEN 1 END) > 0
      ORDER BY paid_refs DESC, total_refs DESC
      LIMIT 5
    `
    topReferrers = topReferrersRaw.map(r => ({
      id: r.id,
      email: r.email,
      telegramName: r.telegram_name,
      referralCount: Number(r.paid_refs),
      totalCount: Number(r.total_refs),
    }))
  } catch { topReferrers = [] }

  // ── Alerts ──
  // 1) Pending payments older than 1 hour
  const hourAgo = new Date(Date.now() - 3600_000)
  const pendingOld = await prisma.payment.count({
    where: { status: 'PENDING', createdAt: { lt: hourAgo } },
  })

  // 2) Revenue drop: yesterday vs avg of last 7 days (ending yesterday)
  const yesterdayStart = new Date(now)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  yesterdayStart.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date(yesterdayStart)
  yesterdayEnd.setDate(yesterdayEnd.getDate() + 1)
  const weekStart = new Date(yesterdayStart)
  weekStart.setDate(weekStart.getDate() - 7)
  const [yesterdayRevAgg, weekRevAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: 'PAID', confirmedAt: { gte: yesterdayStart, lt: yesterdayEnd } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'PAID', confirmedAt: { gte: weekStart, lt: yesterdayStart } },
      _sum: { amount: true },
    }),
  ])
  const avgDayRev = Number(weekRevAgg._sum.amount ?? 0) / 7
  const yesterdayRevNum = Number(yesterdayRevAgg._sum.amount ?? 0)
  const revenueDropPct = avgDayRev > 0
    ? Math.max(0, Math.round(((avgDayRev - yesterdayRevNum) / avgDayRev) * 100))
    : 0

  // 3) Unprocessed webhook payments (no linked transaction yet)
  const unprocessedWebhooks = await prisma.buhWebhookPayment.count({
    where: { transactionId: null },
  }).catch(() => 0)

  // 4) Campaigns in loss (ROI < 0 within current period)
  const lossCampaigns = enrichedCampaigns.filter(c => c.roi < 0).length

  // 5) Traffic running out — users with >80% used, capped list
  let trafficEnding = 0
  try {
    const rmAllStats = await remnawave.getSystemStats().catch(() => null) as any
    // We don't have per-user traffic here cheaply; use coarse approximation
    // from REMNAWAVE if available. Otherwise fallback to 0.
    if (rmAllStats?.users?.trafficWarning) {
      trafficEnding = Number(rmAllStats.users.trafficWarning) || 0
    }
  } catch {}

  // ── MRR (revenue over the last 30 days) ──
  const mrrStart = new Date(Date.now() - 30 * 86400000)
  const mrrAgg = await prisma.payment.aggregate({
    where: { status: 'PAID', provider: { in: ['YUKASSA', 'CRYPTOPAY'] }, confirmedAt: { gte: mrrStart } },
    _sum: { amount: true },
  })
  const mrr = Number(mrrAgg._sum.amount ?? 0)

  // ── VPN stats from REMNAWAVE ──
  const rmStats = await remnawave.getSystemStats().catch(() => null)
  const nodesBlock = rmStats?.nodes ?? {}
  const usersBlock = rmStats?.users ?? {}
  const onlineBlock = rmStats?.onlineStats ?? rmStats?.online ?? {}
  const vpn = {
    nodesOnline: Number(nodesBlock.totalOnline ?? nodesBlock.online ?? 0) || 0,
    onlineNow: Number(onlineBlock.onlineNow ?? onlineBlock.now ?? 0) || 0,
    onlineToday: Number(onlineBlock.onlineToday ?? onlineBlock.today ?? 0) || 0,
    onlineWeek: Number(onlineBlock.onlineWeek ?? onlineBlock.week ?? 0) || 0,
    activeSubs: Number(usersBlock.activeCount ?? usersBlock.active ?? 0) || 0,
  }

  // Infrastructure payments due in the next 7 days
  const infra7d = new Date(Date.now() + 7 * 86400_000)
  const infraDueSoon = await prisma.buhVpnServer.count({
    where: {
      isActive: true,
      nextPaymentDate: { gte: new Date(), lte: infra7d },
    },
  }).catch(() => 0)

  // Infrastructure items already overdue
  const infraOverdue = await prisma.buhVpnServer.count({
    where: {
      isActive: true,
      nextPaymentDate: { lt: new Date() },
    },
  }).catch(() => 0)

  // Count unique users who blocked the bot (across all broadcasts)
  const blockedUsersCount = await prisma.broadcastRecipient.findMany({
    where: { botBlocked: true },
    select: { userId: true },
    distinct: ['userId'],
  }).then(r => r.length).catch(() => 0)

  // Support tickets alerts
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)
  const [openTickets, ticketsOverSla] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }).catch(() => 0),
    prisma.ticket.count({
      where: {
        status: 'OPEN',
        firstResponseAt: null,
        createdAt: { lt: fifteenMinAgo },
      },
    }).catch(() => 0),
  ])

  // Apply dismissals: if an alert with the same value has been dismissed,
  // we zero it out so the frontend hides it.
  const alertsRaw = {
    pendingPayments: pendingOld,
    revenueDropPct,
    unprocessedWebhooks,
    lossCampaigns,
    trafficEnding,
    infraDueSoon,
    infraOverdue,
    botBlockedUsers: blockedUsersCount,
    openTickets,
    ticketsOverSla,
  }
  const alerts = { ...alertsRaw }
  const keyFor = (k: keyof typeof alertsRaw) => `${k}_${alertsRaw[k]}`
  ;(Object.keys(alertsRaw) as Array<keyof typeof alertsRaw>).forEach(k => {
    if (dismissedAlerts.has(keyFor(k))) (alerts as any)[k] = 0
  })

  return {
    period: { days, from: from.toISOString(), to: to.toISOString() },
    alerts,
    kpi: {
      revenue,
      revenuePrev,
      mrr,
      newCustomers,
      newCustomersPaid,
      profit,
      profitPrev,
      ltvCacAvg,
    },
    revenueChart,
    marketing: {
      totalSpend,
      totalRevenue: totalMarketingRevenue,
      totalClicks,
      totalLeads,
      totalConversions,
      funnelRate,
      topCampaigns,
      campaignsByDay,
    },
    customers: {
      newByDay,
      topByLtv: topByLtv.map(u => ({
        id: u.id,
        email: u.email,
        telegramName: u.telegramName,
        totalPaid: Number(u.totalPaid),
        paymentsCount: u.paymentsCount,
      })),
      topReferrers,
      conversionRate,
      active: activeCount,
      expired: expiredCount,
      trial: trialCount,
    },
    vpn,
  }
}

// ── Collect event feed ──
async function collectEvents(limit: number) {
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [payments, manualTransactions, inkasRecords, adCampaigns] = await Promise.all([
    // Only crowded payments from clients (>= 100 ₽)
    prisma.payment.findMany({
      where: { status: 'PAID', confirmedAt: { gte: weekAgo }, amount: { gte: 100 } },
      orderBy: { confirmedAt: 'desc' },
      take: limit,
      select: {
        id: true, amount: true, confirmedAt: true,
        user: { select: { id: true, email: true, telegramName: true } },
      },
    }),
    // Admin actions — manual income/expense from BuhTransaction (source = 'web' or 'bot')
    prisma.buhTransaction.findMany({
      where: {
        date: { gte: weekAgo },
        source: { in: ['web', 'bot', 'manual'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, type: true, amount: true, description: true, date: true, createdAt: true,
        createdBy: { select: { id: true, email: true, telegramName: true } },
        category: { select: { name: true } },
      },
    }),
    // Inkas (dividends / investments / returns)
    prisma.buhInkasRecord.findMany({
      where: { date: { gte: weekAgo } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, type: true, amount: true, date: true, description: true, createdAt: true,
        partner: { select: { name: true } },
        createdBy: { select: { id: true, email: true, telegramName: true } },
      },
    }),
    // New ad campaigns
    prisma.buhAdCampaign.findMany({
      where: { createdAt: { gte: weekAgo } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, channelName: true, amount: true, createdAt: true, format: true },
    }),
  ])

  const events: Array<{
    type: string; icon: string; title: string;
    subtitle: string; time: string; amount?: number; entityId?: string
  }> = []

  payments.forEach(p => {
    const amount = Number(p.amount)
    events.push({
      type: 'payment',
      icon: '🟢',
      title: `Оплата ${amount.toLocaleString('ru-RU')} ₽`,
      subtitle: p.user?.email || p.user?.telegramName || '—',
      time: (p.confirmedAt ?? new Date()).toISOString(),
      amount,
      entityId: p.user?.id || p.id,
    })
  })
  manualTransactions.forEach(t => {
    const amount = Number(t.amount)
    const admin = t.createdBy?.telegramName || t.createdBy?.email || 'Админ'
    events.push({
      type: t.type === 'INCOME' ? 'admin_income' : 'admin_expense',
      icon: t.type === 'INCOME' ? '💰' : '💸',
      title: t.type === 'INCOME'
        ? `Доход +${amount.toLocaleString('ru-RU')} ₽`
        : `Расход −${amount.toLocaleString('ru-RU')} ₽`,
      subtitle: `${admin} · ${t.category?.name || t.description || '—'}`,
      time: (t.createdAt ?? t.date).toISOString(),
      amount,
      entityId: t.id,
    })
  })
  inkasRecords.forEach(r => {
    const amount = Number(r.amount)
    const admin = r.createdBy?.telegramName || r.createdBy?.email || 'Админ'
    const typeLabel = r.type === 'DIVIDEND' ? 'Дивиденды'
      : r.type === 'INVESTMENT' ? 'Инвестиция'
      : r.type === 'RETURN_INV' ? 'Возврат'
      : 'Инкассация'
    events.push({
      type: 'inkas',
      icon: '🤝',
      title: `${typeLabel} ${amount.toLocaleString('ru-RU')} ₽`,
      subtitle: `${admin} · ${r.partner?.name || '—'}`,
      time: (r.createdAt ?? r.date).toISOString(),
      amount,
      entityId: r.id,
    })
  })
  adCampaigns.forEach(c => {
    const amount = Number(c.amount || 0)
    events.push({
      type: 'campaign',
      icon: '📣',
      title: `Новая кампания`,
      subtitle: `${c.channelName}${c.format ? ' · ' + c.format : ''}${amount ? ' · ' + amount.toLocaleString('ru-RU') + ' ₽' : ''}`,
      time: c.createdAt.toISOString(),
      amount: amount || undefined,
      entityId: c.id,
    })
  })
  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  return events.slice(0, limit)
}

// ── Routes ──
export async function adminDashboardOverviewRoutes(app: FastifyInstance) {
  const staff = { preHandler: [app.requireStaff] }

  app.get('/overview', staff, async (req) => {
    const q = req.query as { days?: string; dateFrom?: string; dateTo?: string }
    const days = parseDays(q.days)
    return collectOverview(days, q.dateFrom, q.dateTo)
  })

  app.post('/dismiss-alert', staff, async (req) => {
    const body = (req.body ?? {}) as { alertKey?: string }
    if (!body.alertKey || typeof body.alertKey !== 'string') {
      return { ok: false, error: 'alertKey required' }
    }
    dismissedAlerts.set(body.alertKey, new Date())
    return { ok: true }
  })

  app.get('/events', staff, async (req) => {
    const q = req.query as { limit?: string }
    const limit = Math.max(1, Math.min(100, Number(q.limit) || 20))
    const events = await collectEvents(limit)
    return { events }
  })

  app.get('/export', staff, async (req, reply) => {
    const q = req.query as { sections?: string; format?: 'pdf' | 'excel'; days?: string }
    const format = q.format === 'excel' ? 'excel' : 'pdf'
    const days = parseDays(q.days)
    const sections = new Set(
      (q.sections || 'kpi,marketing,customers,events,vpn').split(',').map(s => s.trim()).filter(Boolean),
    )

    const overview = await collectOverview(days)
    const events = sections.has('events') ? await collectEvents(50) : []

    const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

    if (format === 'excel') {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'HIDEYOU PRO'
      wb.created = new Date()

      const styleHeader = (ws: any) => {
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF534AB7' } }
        ws.getRow(1).height = 24
        ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      }

      if (sections.has('kpi')) {
        const ws = wb.addWorksheet('KPI')
        ws.columns = [{ header: 'Показатель', key: 'k', width: 32 }, { header: 'Значение', key: 'v', width: 22 }]
        ws.addRow({ k: 'Период (дней)', v: overview.period.days })
        ws.addRow({ k: 'Выручка, ₽', v: overview.kpi.revenue })
        ws.addRow({ k: 'Выручка прошлый период, ₽', v: overview.kpi.revenuePrev })
        ws.addRow({ k: 'Новые клиенты', v: overview.kpi.newCustomers })
        ws.addRow({ k: 'Из них оплатили', v: overview.kpi.newCustomersPaid })
        ws.addRow({ k: 'Прибыль, ₽', v: overview.kpi.profit })
        ws.addRow({ k: 'Прибыль прошлый период, ₽', v: overview.kpi.profitPrev })
        ws.addRow({ k: 'LTV/CAC средний', v: overview.kpi.ltvCacAvg ?? '—' })
        styleHeader(ws)
      }

      if (sections.has('marketing')) {
        const ws = wb.addWorksheet('Маркетинг')
        ws.columns = [{ header: 'Показатель', key: 'k', width: 32 }, { header: 'Значение', key: 'v', width: 22 }]
        ws.addRow({ k: 'Потрачено, ₽', v: overview.marketing.totalSpend })
        ws.addRow({ k: 'Получено, ₽', v: overview.marketing.totalRevenue })
        ws.addRow({ k: 'Клики', v: overview.marketing.totalClicks })
        ws.addRow({ k: 'Лиды', v: overview.marketing.totalLeads })
        ws.addRow({ k: 'Оплаты', v: overview.marketing.totalConversions })
        ws.addRow({ k: 'Конверсия воронки, %', v: overview.marketing.funnelRate })
        styleHeader(ws)

        const wsTop = wb.addWorksheet('Топ кампаний')
        wsTop.columns = [
          { header: 'Канал', key: 'n', width: 28 },
          { header: 'Потрачено', key: 's', width: 14 },
          { header: 'Доход', key: 'r', width: 14 },
          { header: 'ROI %', key: 'o', width: 10 },
          { header: 'Оплат', key: 'c', width: 10 },
        ]
        overview.marketing.topCampaigns.forEach(c => wsTop.addRow({
          n: c.channelName, s: c.spend, r: c.revenue, o: c.roi, c: c.conversions,
        }))
        styleHeader(wsTop)
      }

      if (sections.has('customers')) {
        const ws = wb.addWorksheet('Клиенты')
        ws.columns = [{ header: 'Показатель', key: 'k', width: 32 }, { header: 'Значение', key: 'v', width: 22 }]
        ws.addRow({ k: 'Активных', v: overview.customers.active })
        ws.addRow({ k: 'Истёкших', v: overview.customers.expired })
        ws.addRow({ k: 'На пробнике', v: overview.customers.trial })
        ws.addRow({ k: 'Конверсия trial→paid, %', v: overview.customers.conversionRate })
        styleHeader(ws)

        const wsTop = wb.addWorksheet('Топ по LTV')
        wsTop.columns = [
          { header: 'Email', key: 'e', width: 32 },
          { header: 'Telegram', key: 't', width: 22 },
          { header: 'Оплачено, ₽', key: 'p', width: 16 },
          { header: 'Платежей', key: 'n', width: 12 },
        ]
        overview.customers.topByLtv.forEach(u => wsTop.addRow({
          e: u.email ?? '—', t: u.telegramName ?? '—', p: u.totalPaid, n: u.paymentsCount,
        }))
        styleHeader(wsTop)
      }

      if (sections.has('vpn')) {
        const ws = wb.addWorksheet('VPN')
        ws.columns = [{ header: 'Показатель', key: 'k', width: 28 }, { header: 'Значение', key: 'v', width: 16 }]
        ws.addRow({ k: 'Ноды онлайн', v: overview.vpn.nodesOnline })
        ws.addRow({ k: 'Сейчас', v: overview.vpn.onlineNow })
        ws.addRow({ k: 'За день', v: overview.vpn.onlineToday })
        ws.addRow({ k: 'За неделю', v: overview.vpn.onlineWeek })
        ws.addRow({ k: 'Активных подписок', v: overview.vpn.activeSubs })
        styleHeader(ws)
      }

      if (sections.has('events')) {
        const ws = wb.addWorksheet('События')
        ws.columns = [
          { header: 'Тип', key: 't', width: 14 },
          { header: 'Заголовок', key: 'h', width: 32 },
          { header: 'Описание', key: 's', width: 40 },
          { header: 'Время', key: 'd', width: 20 },
        ]
        events.forEach(e => ws.addRow({
          t: e.type, h: e.title, s: e.subtitle,
          d: new Date(e.time).toLocaleString('ru-RU'),
        }))
        styleHeader(ws)
      }

      const buffer = await wb.xlsx.writeBuffer()
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      reply.header('Content-Disposition', `attachment; filename="dashboard_${days}d.xlsx"`)
      return Buffer.from(buffer)
    }

    // PDF via HTML
    const pctChange = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? '+100%' : '0%') : `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%`

    const sectionHtml: string[] = []

    if (sections.has('kpi')) {
      sectionHtml.push(`
        <div class="section-title">Ключевые показатели</div>
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Выручка</div><div class="kpi-value">${fmt(overview.kpi.revenue)} ₽</div><div class="kpi-sub">${pctChange(overview.kpi.revenue, overview.kpi.revenuePrev)} vs пред.</div></div>
          <div class="kpi"><div class="kpi-label">Новые клиенты</div><div class="kpi-value">${overview.kpi.newCustomers}</div><div class="kpi-sub">${overview.kpi.newCustomersPaid} оплатили</div></div>
          <div class="kpi ${overview.kpi.profit >= 0 ? 'pos' : 'neg'}"><div class="kpi-label">Прибыль</div><div class="kpi-value">${fmt(overview.kpi.profit)} ₽</div><div class="kpi-sub">${pctChange(overview.kpi.profit, overview.kpi.profitPrev)}</div></div>
          <div class="kpi"><div class="kpi-label">LTV/CAC</div><div class="kpi-value">${overview.kpi.ltvCacAvg ?? '—'}</div></div>
        </div>`)
    }

    if (sections.has('marketing')) {
      const rows = overview.marketing.topCampaigns.map(c => `
        <tr><td>${c.channelName}</td><td>${fmt(c.spend)} ₽</td><td>${fmt(c.revenue)} ₽</td><td>${c.roi}%</td><td>${c.conversions}</td></tr>
      `).join('')
      sectionHtml.push(`
        <div class="section-title">Маркетинг</div>
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Потрачено</div><div class="kpi-value">${fmt(overview.marketing.totalSpend)} ₽</div></div>
          <div class="kpi"><div class="kpi-label">Получено</div><div class="kpi-value">${fmt(overview.marketing.totalRevenue)} ₽</div></div>
          <div class="kpi"><div class="kpi-label">Клики → Оплаты</div><div class="kpi-value">${overview.marketing.totalClicks} → ${overview.marketing.totalConversions}</div></div>
          <div class="kpi"><div class="kpi-label">Воронка</div><div class="kpi-value">${overview.marketing.funnelRate}%</div></div>
        </div>
        <table><thead><tr><th>Канал</th><th>Потрачено</th><th>Доход</th><th>ROI</th><th>Оплат</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">Нет кампаний</td></tr>'}</tbody></table>`)
    }

    if (sections.has('customers')) {
      const rows = overview.customers.topByLtv.map(u => `
        <tr><td>${u.email ?? u.telegramName ?? '—'}</td><td>${fmt(u.totalPaid)} ₽</td><td>${u.paymentsCount}</td></tr>
      `).join('')
      sectionHtml.push(`
        <div class="section-title">Клиенты</div>
        <div class="kpi-grid">
          <div class="kpi pos"><div class="kpi-label">Активных</div><div class="kpi-value">${overview.customers.active}</div></div>
          <div class="kpi neg"><div class="kpi-label">Истекло</div><div class="kpi-value">${overview.customers.expired}</div></div>
          <div class="kpi"><div class="kpi-label">На пробнике</div><div class="kpi-value">${overview.customers.trial}</div></div>
          <div class="kpi"><div class="kpi-label">Конверсия</div><div class="kpi-value">${overview.customers.conversionRate}%</div></div>
        </div>
        <table><thead><tr><th>Клиент</th><th>Оплачено</th><th>Платежей</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#9ca3af">Нет данных</td></tr>'}</tbody></table>`)
    }

    if (sections.has('vpn')) {
      sectionHtml.push(`
        <div class="section-title">VPN</div>
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Ноды онлайн</div><div class="kpi-value">${overview.vpn.nodesOnline}</div></div>
          <div class="kpi"><div class="kpi-label">Сейчас</div><div class="kpi-value">${overview.vpn.onlineNow}</div></div>
          <div class="kpi"><div class="kpi-label">За день</div><div class="kpi-value">${overview.vpn.onlineToday}</div></div>
          <div class="kpi"><div class="kpi-label">За неделю</div><div class="kpi-value">${overview.vpn.onlineWeek}</div></div>
        </div>`)
    }

    if (sections.has('events')) {
      const rows = events.slice(0, 30).map(e => `
        <tr><td>${e.icon}</td><td>${e.title}</td><td>${e.subtitle}</td><td>${new Date(e.time).toLocaleString('ru-RU')}</td></tr>
      `).join('')
      sectionHtml.push(`
        <div class="section-title">Последние события</div>
        <table><thead><tr><th></th><th>Событие</th><th>Описание</th><th>Время</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af">Нет событий</td></tr>'}</tbody></table>`)
    }

    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт дашборда</title>
<style>
@page{size:A4;margin:1.5cm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;background:#fff;padding:20px;max-width:900px;margin:0 auto}
.header{background:linear-gradient(135deg,#534AB7,#7c3aed);color:#fff;padding:24px;border-radius:12px;margin-bottom:24px}
.header h1{font-size:24px;margin-bottom:8px}
.header .meta{font-size:13px;opacity:0.9;margin-top:8px}
.section-title{font-size:14px;font-weight:700;color:#534AB7;text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid #534AB7}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.kpi{background:#f9fafb;padding:12px;border-radius:8px;border-left:3px solid #534AB7}
.kpi-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px}
.kpi-value{font-size:18px;font-weight:700;color:#111827}
.kpi-sub{font-size:10px;color:#6b7280;margin-top:3px}
.kpi.pos .kpi-value{color:#059669}.kpi.neg .kpi-value{color:#dc2626}
.kpi.pos{border-left-color:#059669}.kpi.neg{border-left-color:#dc2626}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
thead th{background:#534AB7;color:#fff;padding:10px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase}
tbody td{padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#374151}
tbody tr:nth-child(even){background:#f9fafb}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:10px}
.print-btn{position:fixed;top:20px;right:20px;background:#534AB7;color:#fff;padding:10px 18px;border-radius:8px;border:none;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(83,74,183,0.3)}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨 Сохранить в PDF</button>
<div class="header">
  <h1>📊 Отчёт по дашборду</h1>
  <div class="meta">Период: ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} · с ${new Date(overview.period.from).toLocaleDateString('ru-RU')} по ${new Date(overview.period.to).toLocaleDateString('ru-RU')}</div>
</div>
${sectionHtml.join('\n')}
<div class="footer">Сгенерировано ${new Date().toLocaleString('ru-RU')} · HIDEYOU PRO</div>
</body></html>`
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return html
  })
}
