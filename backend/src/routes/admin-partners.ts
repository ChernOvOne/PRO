import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminPartnerRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }
  const staff = { preHandler: [app.requireStaff] }

  // ── GET / — list active partners ─────────────────────────────
  app.get('/', staff, async (req) => {
    const role = (req.user as any).role
    const userId = (req.user as any).sub

    // INVESTOR / PARTNER see only their own partner
    if (role === 'INVESTOR' || role === 'PARTNER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { buhPartnerId: true },
      })
      if (!user?.buhPartnerId) return []

      const partner = await prisma.buhPartner.findFirst({
        where: { id: user.buhPartnerId, isActive: true },
        include: { inkasRecords: { select: { type: true, amount: true, date: true } } },
      })
      if (!partner) return []

      const sumByType = (t: string) =>
        partner.inkasRecords.filter(r => r.type === t).reduce((s, r) => s + Number(r.amount), 0)

      const { inkasRecords, ...partnerData } = partner
      return [{
        ...partnerData,
        totalInvested:  partner.initialInvestment + sumByType('INVESTMENT'),
        totalReturned:  partner.initialReturned   + sumByType('RETURN_INV'),
        totalDividends: partner.initialDividends  + sumByType('DIVIDEND'),
        remainingDebt:  Math.max(0, (partner.initialInvestment + sumByType('INVESTMENT')) - (partner.initialReturned + sumByType('RETURN_INV'))),
      }]
    }

    // Admin / Editor — all active with computed stats
    const partners = await prisma.buhPartner.findMany({
      where: { isActive: true },
      include: { inkasRecords: { select: { type: true, amount: true, date: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return partners.map(p => {
      const sumByType = (t: string) =>
        p.inkasRecords.filter(r => r.type === t).reduce((s, r) => s + Number(r.amount), 0)

      const totalInvested  = p.initialInvestment + sumByType('INVESTMENT')
      const totalReturned  = p.initialReturned   + sumByType('RETURN_INV')
      const totalDividends = p.initialDividends  + sumByType('DIVIDEND')
      const remainingDebt  = Math.max(0, totalInvested - totalReturned)

      const lastDiv = p.inkasRecords
        .filter(r => r.type === 'DIVIDEND')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

      const { inkasRecords, ...partnerData } = p
      return {
        ...partnerData,
        totalInvested,
        totalReturned,
        totalDividends,
        remainingDebt,
        lastDividend: lastDiv ? Number(lastDiv.amount) : null,
        lastDividendDate: lastDiv?.date ?? null,
      }
    })
  })

  // ── POST / — create partner ──────────────────────────────────
  app.post('/', admin, async (req, reply) => {
    const body = z
      .object({
        name:              z.string().min(1),
        roleLabel:         z.string().min(1),
        tgUsername:         z.string().optional(),
        tgId:              z.string().optional(),
        sharePercent:      z.number().min(0).max(100).optional(),
        avatarColor:       z.string().optional(),
        initials:          z.string().optional(),
        notes:             z.string().optional(),
        initialInvestment: z.number().min(0).default(0),
        initialReturned:   z.number().min(0).default(0),
        initialDividends:  z.number().min(0).default(0),
      })
      .parse(req.body)

    const partner = await prisma.buhPartner.create({ data: body })
    reply.status(201)
    return partner
  })

  // ── GET /:id — partner detail with stats ─────────────────────
  app.get('/:id', staff, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const role = (req.user as any).role
    const userId = (req.user as any).sub

    // Access check for INVESTOR / PARTNER
    if (role === 'INVESTOR' || role === 'PARTNER') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { buhPartnerId: true },
      })
      if (user?.buhPartnerId !== id) {
        return reply.status(403).send({ error: 'Forbidden' })
      }
    }

    const partner = await prisma.buhPartner.findUnique({ where: { id } })
    if (!partner) return reply.status(404).send({ error: 'Partner not found' })

    // Aggregate inkas records by type
    const aggregates = await prisma.buhInkasRecord.groupBy({
      by: ['type'],
      where: { partnerId: id },
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

    // Last dividends for avg + most recent
    const recentDividends = await prisma.buhInkasRecord.findMany({
      where: { partnerId: id, type: 'DIVIDEND' },
      orderBy: { date: 'desc' },
      take: 12,
      select: { amount: true, date: true, monthLabel: true },
    })

    const lastDividend = recentDividends.length > 0
      ? { amount: Number(recentDividends[0].amount), date: recentDividends[0].date, monthLabel: recentDividends[0].monthLabel }
      : null

    const avgDividend = recentDividends.length > 0
      ? recentDividends.reduce((s, r) => s + Number(r.amount), 0) / recentDividends.length
      : 0

    // Hide notes from INVESTOR / PARTNER
    const isRestricted = role === 'INVESTOR' || role === 'PARTNER'
    const { notes, ...partnerPublic } = partner

    return {
      ...(isRestricted ? partnerPublic : partner),
      stats: {
        totalInvested,
        totalReturned,
        totalDividends,
        remainingDebt,
        avgDividend: Math.round(avgDividend * 100) / 100,
        lastDividend,
      },
    }
  })

  // ── PATCH /:id — update partner ──────────────────────────────
  app.patch('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const body = z
      .object({
        name:              z.string().min(1).optional(),
        roleLabel:         z.string().min(1).optional(),
        tgUsername:         z.string().nullable().optional(),
        tgId:              z.string().nullable().optional(),
        sharePercent:      z.number().min(0).max(100).nullable().optional(),
        avatarColor:       z.string().optional(),
        initials:          z.string().nullable().optional(),
        notes:             z.string().nullable().optional(),
        initialInvestment: z.number().min(0).optional(),
        initialReturned:   z.number().min(0).optional(),
        initialDividends:  z.number().min(0).optional(),
      })
      .parse(req.body)

    const existing = await prisma.buhPartner.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Partner not found' })

    return prisma.buhPartner.update({ where: { id }, data: body })
  })

  // ── DELETE /:id — soft delete (isActive=false) ───────────────
  app.delete('/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const existing = await prisma.buhPartner.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Partner not found' })

    await prisma.buhPartner.update({ where: { id }, data: { isActive: false } })
    return { ok: true }
  })
}
