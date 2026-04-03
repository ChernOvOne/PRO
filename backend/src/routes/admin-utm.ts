import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminUtmRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ─────────────────────────────────────────────────────────
  //  UTM STATS FOR A SPECIFIC CODE
  // ─────────────────────────────────────────────────────────
  app.get('/stats/:code', editor, async (req, reply) => {
    const { code } = req.params as { code: string }

    const campaign = await prisma.buhAdCampaign.findUnique({
      where: { utmCode: code },
    })

    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const [clicks, leads, conversions] = await Promise.all([
      prisma.buhUtmClick.count({ where: { utmCode: code } }),
      prisma.buhUtmLead.count({ where: { utmCode: code } }),
      prisma.buhUtmLead.count({ where: { utmCode: code, converted: true } }),
    ])

    return { clicks, leads, conversions, campaign }
  })

  // ─────────────────────────────────────────────────────────
  //  OVERALL UTM SUMMARY
  // ─────────────────────────────────────────────────────────
  app.get('/summary', editor, async () => {
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

    let totalClicks      = 0
    let totalLeads       = 0
    let totalConversions = 0

    const campaignStats = campaigns.map((c) => {
      const clicks      = clickMap.get(c.utmCode) ?? 0
      const leads       = leadMap.get(c.utmCode) ?? 0
      const conversions = conversionMap.get(c.utmCode) ?? 0

      totalClicks      += clicks
      totalLeads       += leads
      totalConversions += conversions

      return { utmCode: c.utmCode, clicks, leads, conversions }
    })

    const conversionRate = totalLeads > 0
      ? Math.round((totalConversions / totalLeads) * 10000) / 100
      : 0

    return {
      totalClicks,
      totalLeads,
      totalConversions,
      conversionRate,
      campaigns: campaignStats,
    }
  })
}
