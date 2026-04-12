import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminBuhDashboardRoutes(app: FastifyInstance) {
  const staff = { preHandler: [app.requireStaff] }

  // ─────────────────────────────────────────────────────────
  //  UNIFIED FINANCIAL DASHBOARD
  // ─────────────────────────────────────────────────────────
  app.get('/', staff, async (req) => {
    const role   = (req.user as any).role
    const userId = (req.user as any).sub

    const q = req.query as {
      period?: string
      date_from?: string
      date_to?: string
    }

    // ── INVESTOR / PARTNER — restricted view ──────────────
    if (role === 'INVESTOR' || role === 'PARTNER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { buhPartnerId: true },
      })

      if (!user?.buhPartnerId) {
        return { partnersSummary: [] }
      }

      const partner = await prisma.buhPartner.findUnique({
        where: { id: user.buhPartnerId },
      })
      if (!partner || !partner.isActive) {
        return { partnersSummary: [] }
      }

      const aggregates = await prisma.buhInkasRecord.groupBy({
        by: ['type'],
        where: { partnerId: partner.id },
        _sum: { amount: true },
      })

      const sumByType = (t: string) => {
        const row = aggregates.find((a) => a.type === t)
        return row?._sum?.amount ? Number(row._sum.amount) : 0
      }

      const totalInvested  = partner.initialInvestment + sumByType('INVESTMENT')
      const totalReturned  = partner.initialReturned   + sumByType('RETURN_INV')
      const totalDividends = partner.initialDividends  + sumByType('DIVIDEND')
      const remainingDebt  = Math.max(0, totalInvested - totalReturned)

      const lastDiv = await prisma.buhInkasRecord.findFirst({
        where: { partnerId: partner.id, type: 'DIVIDEND' },
        orderBy: { date: 'desc' },
        select: { amount: true, date: true },
      })

      return {
        partnersSummary: [
          {
            id:              partner.id,
            name:            partner.name,
            roleLabel:       partner.roleLabel,
            avatarColor:     partner.avatarColor,
            initials:        partner.initials,
            totalInvested,
            totalReturned,
            totalDividends,
            remainingDebt,
            lastDividend:     lastDiv ? Number(lastDiv.amount) : null,
            lastDividendDate: lastDiv?.date ?? null,
          },
        ],
      }
    }

    // ── FULL DASHBOARD (admin / editor) ───────────────────
    const now = new Date()

    // Period helpers
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd   = new Date(todayStart.getTime() + 86400000 - 1)

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    const yearStart = new Date(now.getFullYear(), 0, 1)
    const yearEnd   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)

    // Helper to compute KPI for a date range
    async function computeKPI(from: Date, to: Date, daysInPeriod: number) {
      const [incomeAgg, expenseAgg, bestDayRows] = await Promise.all([
        prisma.buhTransaction.aggregate({
          where: { type: 'INCOME', date: { gte: from, lte: to } },
          _sum: { amount: true },
        }),
        prisma.buhTransaction.aggregate({
          where: { type: 'EXPENSE', date: { gte: from, lte: to }, NOT: { source: 'investment' } },
          _sum: { amount: true },
        }),
        prisma.$queryRaw<Array<{ day: Date; total: number }>>`
          SELECT date AS day, COALESCE(SUM(amount), 0)::numeric AS total
          FROM buh_transactions
          WHERE type = 'INCOME' AND date >= ${from} AND date <= ${to}
          GROUP BY date
          ORDER BY total DESC
          LIMIT 1
        `,
      ])

      const income  = Number(incomeAgg._sum.amount ?? 0)
      const expense = Number(expenseAgg._sum.amount ?? 0)
      const profit  = income - expense
      const avgPerDay = daysInPeriod > 0 ? Math.round((income / daysInPeriod) * 100) / 100 : 0
      const bestDay       = bestDayRows.length > 0 ? bestDayRows[0].day : null
      const bestDayAmount = bestDayRows.length > 0 ? Number(bestDayRows[0].total) : 0

      return { income, expense, profit, avgPerDay, bestDay, bestDayAmount }
    }

    const dayOfMonth = now.getDate()
    const dayOfYear  = Math.ceil((now.getTime() - yearStart.getTime()) / 86400000) + 1

    // 30-day chart range
    const chart30Start = new Date(now)
    chart30Start.setDate(chart30Start.getDate() - 29)
    chart30Start.setHours(0, 0, 0, 0)

    // 7-day server warning range
    const warningDate = new Date(now)
    warningDate.setDate(warningDate.getDate() + 7)

    const [
      todayKPI,
      monthKPI,
      yearKPI,
      startingBalanceSetting,
      allIncomeAgg,
      allExpenseAgg,
      allInkasAgg,
      expenseByCategory,
      incomeChartRows,
      partners,
      serversWarning,
      adStats,
      recentTransactions,
      recentPayments,
      milestones,
    ] = await Promise.all([
      // Period KPIs
      computeKPI(todayStart, todayEnd, 1),
      computeKPI(monthStart, monthEnd, dayOfMonth),
      computeKPI(yearStart, yearEnd, dayOfYear),

      // Balance components
      prisma.setting.findUnique({ where: { key: 'starting_balance' } }),
      prisma.buhTransaction.aggregate({
        where: { type: 'INCOME' },
        _sum: { amount: true },
      }),
      prisma.buhTransaction.aggregate({
        where: { type: 'EXPENSE', NOT: { source: 'investment' } },
        _sum: { amount: true },
      }),
      prisma.buhInkasRecord.aggregate({
        where: { type: { in: ['DIVIDEND', 'RETURN_INV'] } },
        _sum: { amount: true },
      }),

      // Expense breakdown by category for current month
      prisma.$queryRaw<Array<{ name: string; color: string; amount: number }>>`
        SELECT
          COALESCE(c.name, 'Без категории') AS name,
          COALESCE(c.color, '#999999') AS color,
          COALESCE(SUM(t.amount), 0)::numeric AS amount
        FROM buh_transactions t
        LEFT JOIN buh_categories c ON c.id = t.category_id
        WHERE t.type = 'EXPENSE'
          AND (t.source IS DISTINCT FROM 'investment')
          AND t.date >= ${monthStart}
          AND t.date <= ${monthEnd}
        GROUP BY c.name, c.color
        ORDER BY amount DESC
      `,

      // Income chart — last 30 days
      prisma.$queryRaw<Array<{ date: Date; amount: number }>>`
        SELECT date, COALESCE(SUM(amount), 0)::numeric AS amount
        FROM buh_transactions
        WHERE type = 'INCOME'
          AND date >= ${chart30Start}
          AND date <= ${now}
        GROUP BY date
        ORDER BY date ASC
      `,

      // Partners summary
      prisma.buhPartner.findMany({
        where: { isActive: true },
        include: { inkasRecords: true },
      }),

      // Servers with payment due in 7 days
      prisma.buhVpnServer.findMany({
        where: {
          isActive: true,
          nextPaymentDate: { lte: warningDate },
        },
        orderBy: { nextPaymentDate: 'asc' },
      }),

      // Ad stats for current month
      prisma.buhAdCampaign.aggregate({
        where: {
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true, subscribersGained: true },
        _count: true,
      }),

      // Recent transactions (last 10)
      prisma.buhTransaction.findMany({
        include: { category: true },
        orderBy: { date: 'desc' },
        take: 10,
      }),

      // Recent webhook payments (last 6)
      prisma.buhWebhookPayment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),

      // Active milestones
      prisma.buhMilestone.findMany({
        where: { isCompleted: false },
      }),
    ])

    // Balance calculation
    const startingBalance = startingBalanceSetting ? Number(startingBalanceSetting.value) : 0
    const totalIncome     = Number(allIncomeAgg._sum.amount ?? 0)
    const totalExpense    = Number(allExpenseAgg._sum.amount ?? 0)
    const totalInkas      = Number(allInkasAgg._sum.amount ?? 0)
    const balance         = startingBalance + totalIncome - totalExpense - totalInkas

    // Partners summary
    const partnersSummary = partners.map((p) => {
      const sumByType = (t: string) =>
        p.inkasRecords
          .filter((r) => r.type === t)
          .reduce((s, r) => s + Number(r.amount), 0)

      const totalInvested  = p.initialInvestment + sumByType('INVESTMENT')
      const totalReturned  = p.initialReturned   + sumByType('RETURN_INV')
      const totalDividends = p.initialDividends  + sumByType('DIVIDEND')
      const remainingDebt  = Math.max(0, totalInvested - totalReturned)

      const lastDivRecord = p.inkasRecords
        .filter((r) => r.type === 'DIVIDEND')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

      return {
        id:               p.id,
        name:             p.name,
        roleLabel:        p.roleLabel,
        avatarColor:      p.avatarColor,
        initials:         p.initials,
        totalInvested,
        totalReturned,
        totalDividends,
        remainingDebt,
        lastDividend:     lastDivRecord ? Number(lastDivRecord.amount) : null,
        lastDividendDate: lastDivRecord?.date ?? null,
      }
    })

    // Income chart — fill gaps with zero
    const incomeChart: Array<{ date: string; amount: number }> = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(chart30Start)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const row = (incomeChartRows as any[]).find(
        (r) => new Date(r.date).toISOString().slice(0, 10) === key,
      )
      incomeChart.push({ date: key, amount: row ? Number(row.amount) : 0 })
    }

    // Ad stats
    const totalSpent       = Number(adStats._sum.amount ?? 0)
    const totalSubscribers = Number(adStats._sum.subscribersGained ?? 0)
    const campaignsCount   = adStats._count
    const costPerSub       = totalSubscribers > 0
      ? Math.round((totalSpent / totalSubscribers) * 100) / 100
      : 0

    // Milestones with progress
    const milestonesResult = milestones.map((m) => ({
      id:              m.id,
      title:           m.title,
      targetAmount:    Number(m.targetAmount),
      currentAmount:   Number(m.currentAmount),
      type:            m.type,
      progressPercent: Math.min(
        100,
        Number(m.targetAmount) > 0
          ? Math.round((Number(m.currentAmount) / Number(m.targetAmount)) * 10000) / 100
          : 0,
      ),
    }))

    return {
      today: todayKPI,
      month: monthKPI,
      year:  yearKPI,
      balance,
      expenseByCategory: (expenseByCategory as any[]).map((r) => ({
        name:   r.name,
        color:  r.color,
        amount: Number(r.amount),
      })),
      incomeChart,
      partnersSummary,
      serversWarning,
      adStats: {
        totalSpent,
        totalSubscribers,
        costPerSub,
        campaignsCount,
      },
      recentTransactions,
      recentPayments,
      milestones: milestonesResult,
    }
  })
}
