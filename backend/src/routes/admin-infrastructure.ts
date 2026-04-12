import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function adminInfrastructureRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ── GET / — list active VPN servers with dynamic status ────────
  app.get('/', editor, async () => {
    const servers = await prisma.buhVpnServer.findMany({
      where: { isActive: true },
      include: { recurringPayments: true },
      orderBy: { nextPaymentDate: 'asc' },
    })

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    return servers.map((s) => {
      let daysUntilPayment: number | null = null
      let dynamicStatus: string = s.status

      if (s.nextPaymentDate) {
        const next = new Date(s.nextPaymentDate)
        next.setHours(0, 0, 0, 0)
        daysUntilPayment = Math.ceil(
          (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        )

        if (daysUntilPayment > 5) dynamicStatus = 'ACTIVE'
        else if (daysUntilPayment >= 0) dynamicStatus = 'WARNING'
        else dynamicStatus = 'EXPIRED'
      }

      return { ...s, daysUntilPayment, dynamicStatus }
    })
  })

  // ── POST / — create a VPN server ──────────────────────────────
  app.post('/', editor, async (req) => {
    const body = z
      .object({
        name:             z.string().min(1),
        provider:         z.string().optional(),
        ipAddress:        z.string().optional(),
        purpose:          z.string().optional(),
        panelUrl:         z.string().optional(),
        monthlyCost:      z.number().optional(),
        currency:         z.string().optional(),
        paymentDay:       z.number().int().min(1).max(31).optional(),
        nextPaymentDate:  z.string().optional(),
        notifyDaysBefore: z.number().int().min(0).optional(),
        notes:            z.string().optional(),
        type:             z.string().optional(),
        metadata:         z.any().optional(),
        periodicity:      z.string().optional(),
        autoRenew:        z.boolean().optional(),
      })
      .parse(req.body)

    return prisma.buhVpnServer.create({
      data: {
        name:             body.name,
        provider:         body.provider,
        ipAddress:        body.ipAddress,
        purpose:          body.purpose,
        panelUrl:         body.panelUrl,
        monthlyCost:      body.monthlyCost,
        currency:         body.currency,
        paymentDay:       body.paymentDay,
        nextPaymentDate:  body.nextPaymentDate
          ? new Date(body.nextPaymentDate)
          : undefined,
        notifyDaysBefore: body.notifyDaysBefore,
        notes:            body.notes,
        type:             body.type ?? 'vpn_server',
        metadata:         body.metadata ?? undefined,
        periodicity:      body.periodicity ?? 'monthly',
        autoRenew:        body.autoRenew ?? false,
      },
      include: { recurringPayments: true },
    })
  })

  // ── PATCH /:id — update a VPN server ──────────────────────────
  app.patch('/:id', editor, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    const body = z
      .object({
        name:             z.string().min(1).optional(),
        provider:         z.string().optional(),
        ipAddress:        z.string().optional(),
        purpose:          z.string().optional(),
        panelUrl:         z.string().optional(),
        monthlyCost:      z.number().optional(),
        currency:         z.string().optional(),
        paymentDay:       z.number().int().min(1).max(31).optional(),
        nextPaymentDate:  z.string().optional(),
        notifyDaysBefore: z.number().int().min(0).optional(),
        notes:            z.string().optional(),
        type:             z.string().optional(),
        metadata:         z.any().optional(),
        periodicity:      z.string().optional(),
        autoRenew:        z.boolean().optional(),
      })
      .parse(req.body)

    const data: Record<string, unknown> = { ...body }
    if (body.nextPaymentDate) {
      data.nextPaymentDate = new Date(body.nextPaymentDate)
    }

    return prisma.buhVpnServer.update({
      where: { id },
      data,
      include: { recurringPayments: true },
    })
  })

  // ── DELETE /:id — soft-delete (isActive = false) ──────────────
  app.delete('/:id', editor, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)

    return prisma.buhVpnServer.update({
      where: { id },
      data:  { isActive: false, status: 'INACTIVE' },
    })
  })
}
